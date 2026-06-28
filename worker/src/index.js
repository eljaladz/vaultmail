import PostalMime from 'postal-mime';

const handler = {
  async email(message, env) {
    try {
        const parser = new PostalMime();
        const rawEmail = await new Response(message.raw).arrayBuffer();
        const email = await parser.parse(rawEmail);
        const toBase64 = (value) => {
          if (!value) return '';
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          let binary = '';
          bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
          });
          return btoa(binary);
        };

        const targetUrl = env.WEBHOOK_URL;
        const webhookSecret = env.WEBHOOK_SECRET;
        const attachmentMaxBytes = parseInt(env.ATTACHMENT_MAX_BYTES || '2000000', 10);
        const forwardDomains = (env.FORWARD_DOMAINS || '')
          .split(',')
          .map((domain) => domain.trim().toLowerCase())
          .filter(Boolean);
        const forwardEmail = env.FORWARD_EMAIL;

        const parsedSenderAddress = email?.sender?.value?.[0]?.address;
        const parsedSenderName = email?.sender?.value?.[0]?.name;
        const parsedFromAddress = email?.from?.value?.[0]?.address;
        const parsedFromName = email?.from?.value?.[0]?.name;
        const parsedFromText = email?.from?.text || message.headers.get('from');
        const fallbackFromName = parsedFromAddress
          ? parsedFromAddress.split('@').pop()?.replace(/^mail\./, '')
          : undefined;
        const cleanName = (value) => value?.replace(/^"+|"+$/g, '').trim();
        const parsedFrom =
          parsedSenderName && parsedSenderAddress
            ? `${cleanName(parsedSenderName)} <${parsedSenderAddress}>`
            : parsedFromName && parsedFromAddress
              ? `${cleanName(parsedFromName)} <${parsedFromAddress}>`
              : cleanName(parsedSenderName) ||
                cleanName(parsedFromName) ||
                parsedFromText ||
                fallbackFromName ||
                parsedFromAddress ||
                parsedSenderAddress ||
                message.from;

        const recipients = Array.isArray(message.to) ? message.to : [message.to];
        const shouldForward =
          Boolean(forwardEmail) &&
          forwardDomains.length > 0 &&
          recipients.some((recipient) => {
            const domain = recipient?.split('@').pop()?.toLowerCase();
            return domain && forwardDomains.includes(domain);
          });

        if (shouldForward) {
          await message.forward(forwardEmail);
        }

        if (!targetUrl) {
          console.warn('WEBHOOK_URL is not set; skipping webhook forwarding.');
          return;
        }

        if (!webhookSecret) {
          console.warn('WEBHOOK_SECRET is not set; webhook will be rejected by app.');
        }

        const attachments = Array.isArray(email.attachments)
          ? email.attachments.map((attachment) => {
              const oversized = typeof attachment.size === 'number' && attachment.size > attachmentMaxBytes;
              return {
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size,
                contentBase64: oversized ? undefined : toBase64(attachment.content),
                omitted: oversized || undefined,
                contentId: attachment.contentId
              };
            })
          : [];

        const headers = { 'Content-Type': 'application/json' };
        if (webhookSecret) {
          headers['x-webhook-secret'] = webhookSecret;
        }

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from: parsedFrom,
            to: message.to,
            subject: message.headers.get('subject'),
            text: email.text,
            html: email.html,
            attachments
          })
        });

        if (!response.ok) {
            console.error(`Failed to forward email: ${response.status} ${response.statusText}`);
            message.setReject("Failed to forward email");
        }
    } catch (e) {
        console.error("Worker Error:", e);
        message.setReject("Internal Worker Error");
    }
  }
};

export default handler;
