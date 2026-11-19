import nodemailer, { Transporter } from 'nodemailer';
import { ENV } from '../config/env';

export interface SendResetEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  devLink?: string;
}

export interface AdminPaymentItem {
  name: string;
  quantity: number;
  priceRupees: number;
}

export interface AdminPaymentNotificationParams {
  orderType: 'Store Order' | 'Deck Pass' | 'Card Unlock' | 'Premium Reading';
  orderId: string;
  paymentId: string;
  amountRupees: number;
  paymentMethod?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items?: AdminPaymentItem[];
  shippingAddress?: {
    fullName?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  notes?: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (user && pass) {
      if (host) {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        this.isConfigured = true;
      } else if (user.includes('@gmail.com')) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass },
        });
        this.isConfigured = true;
      }
    }
  }

  private getTransporter(): Transporter | null {
    if (!this.transporter) {
      this.initTransporter();
    }
    return this.transporter;
  }

  /**
   * Send a branded password reset email with secure token link
   */
  public async sendPasswordResetEmail(
    toEmail: string,
    recipientName: string,
    resetToken: string,
    accountType: 'customer' | 'admin' = 'customer'
  ): Promise<SendResetEmailResult> {
    const frontendBase =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production' || process.env.VERCEL
        ? 'https://parrot-cards.vercel.app'
        : 'http://localhost:5173');

    const resetPath = accountType === 'admin' ? '/admin/reset-password' : '/reset-password';
    const resetUrl = `${frontendBase.replace(/\/$/, '')}${resetPath}?token=${encodeURIComponent(resetToken)}${
      accountType === 'admin' ? '&type=admin' : ''
    }`;
    const accountLabel = accountType === 'admin' ? 'Parrot Cards Administrator' : 'Parrot Cards';
    const emailSubject = accountType === 'admin' ? 'Reset Your Admin Password' : 'Reset Your Parrot Cards Password';

    const fromAddress =
      process.env.SMTP_FROM ||
      (process.env.SMTP_USER ? `"Parrot Cards" <${process.env.SMTP_USER}>` : '"Parrot Cards" <no-reply@parrotcards.com>');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F5EE; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1A1817;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8F5EE; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #FFFDF9; border: 1px solid rgba(140, 109, 59, 0.25); border-radius: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.06); overflow: hidden;">
          <!-- Top Gold Accent Bar -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #8C6D3B, #D4AF37, #8C6D3B);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: center;">
              <div style="font-size: 26px; color: #8C6D3B; line-height: 1; margin-bottom: 8px;">✦</div>
              <h1 style="margin: 0; font-family: 'Cinzel', Georgia, serif; font-size: 24px; letter-spacing: 2px; color: #1A1817; text-transform: uppercase;">
                Parrot Cards
              </h1>
              <p style="margin: 6px 0 0 0; font-style: italic; font-size: 13px; color: #8C6D3B;">
                ${accountType === 'admin' ? 'Security & Administrator Recovery' : 'Cosmic Wisdom & Authentic Vedic Placements'}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <h2 style="font-size: 18px; color: #1A1817; margin-bottom: 12px; font-weight: 600;">
                ${accountType === 'admin' ? 'Administrator Password Reset' : 'Password Reset Request'}
              </h2>
              <p style="font-size: 14px; line-height: 1.6; color: #4A4643; margin-bottom: 24px;">
                Namaste <strong>${recipientName || (accountType === 'admin' ? 'Administrator' : 'Seeker')}</strong>,<br/><br/>
                We received a request to reset the password for your ${accountLabel} account (<strong>${toEmail}</strong>). Click the button below to choose a new password:
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #8C6D3B, #71562B); color: #FFFDF9; text-decoration: none; padding: 14px 32px; border-radius: 14px; font-weight: bold; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 6px 16px rgba(140, 109, 59, 0.35);">
                      Reset My Password &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; line-height: 1.5; color: #7A746E; margin-top: 24px; padding: 14px; background-color: #F2ECE1; border-radius: 12px; border-left: 3px solid #8C6D3B;">
                ⏳ <strong>Security Note:</strong> This reset link is valid for <strong>1 hour</strong>. If you did not request this change, please ignore this email; your existing password will remain unchanged.
              </p>

              <p style="font-size: 12px; color: #7A746E; margin-top: 20px; word-break: break-all;">
                If the button above does not work, copy and paste this link into your browser:<br/>
                <a href="${resetUrl}" style="color: #8C6D3B;">${resetUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; background-color: #F8F5EE; border-top: 1px solid rgba(140, 109, 59, 0.15); text-align: center; font-size: 11px; color: #8C6D3B;">
              © ${new Date().getFullYear()} Parrot Cards. Protected with high-precision Swiss Ephemeris astronomy.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const transporter = this.getTransporter();

    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: fromAddress,
          to: toEmail,
          subject: emailSubject,
          html: htmlContent,
          text: `Namaste ${recipientName || (accountType === 'admin' ? 'Administrator' : 'Seeker')},\n\nWe received a request to reset the password for your ${accountLabel} account. Please visit this link to set a new password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.`,
        });

        console.log(`✨ [EMAIL SERVICE]: Password reset email dispatched to ${toEmail} (msgId: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error('❌ [EMAIL SERVICE ERROR]: Failed to send email via SMTP:', err.message);
        // Fall back to logging reset URL so the user is never stranded
        console.log(`🔗 [FALLBACK RESET LINK for ${toEmail}]: ${resetUrl}`);
        return { success: true, devLink: resetUrl };
      }
    } else {
      // SMTP not configured (e.g. local dev / test) -> Log clearly to console
      console.log(`\n======================================================`);
      console.log(`📧 [EMAIL SERVICE - LOCAL/PREVIEW MODE]`);
      console.log(`To: ${toEmail} (${recipientName})`);
      console.log(`Action: Password Reset Requested`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log(`======================================================\n`);

      return {
        success: true,
        devLink: resetUrl,
      };
    }
  }

  /**
   * Send a branded support reply email to the customer who submitted a contact inquiry
   */
  public async sendContactReplyEmail(params: {
    toEmail: string;
    customerName: string;
    subject: string;
    originalMessage: string;
    replyText: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { toEmail, customerName, subject, originalMessage, replyText } = params;

    const fromAddress =
      process.env.SMTP_FROM ||
      (process.env.SMTP_USER
        ? `"Parrot Cards Support" <${process.env.SMTP_USER}>`
        : '"Parrot Cards Support" <support@parrotcards.com>');

    const emailSubject = `Re: ${subject || 'Your Inquiry'} - Parrot Cards Support`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F5EE; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1A1817;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8F5EE; padding: 35px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #FFFDF9; border: 1px solid rgba(140, 109, 59, 0.25); border-radius: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.06); overflow: hidden;">
          <!-- Top Gold Accent Bar -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #8C6D3B, #D4AF37, #8C6D3B);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px 18px 36px; text-align: center;">
              <div style="font-size: 26px; color: #8C6D3B; line-height: 1; margin-bottom: 8px;">✦</div>
              <h1 style="margin: 0; font-family: 'Cinzel', Georgia, serif; font-size: 24px; letter-spacing: 2px; color: #1A1817; text-transform: uppercase;">
                Parrot Cards
              </h1>
              <p style="margin: 6px 0 0 0; font-style: italic; font-size: 13px; color: #8C6D3B;">
                Customer Support Response
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <p style="font-size: 15px; line-height: 1.6; color: #2C2016; margin-bottom: 18px;">
                Namaste <strong>${customerName || 'Seeker'}</strong>,<br/><br/>
                Thank you for reaching out to us. Regarding your inquiry on <strong>&ldquo;${subject}&rdquo;</strong>, our support team has provided the following response:
              </p>

              <!-- Support Reply Box -->
              <div style="background-color: #FAF5EE; border: 1px solid #E5D7C6; border-left: 4px solid #8C6D3B; border-radius: 14px; padding: 18px 20px; margin: 20px 0;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; color: #8C6D3B; margin-bottom: 8px;">
                  Response from Parrot Cards Support:
                </div>
                <div style="font-size: 14px; line-height: 1.6; color: #2C2016; white-space: pre-line;">
${replyText}
                </div>
              </div>

              <!-- Original Message Box -->
              <div style="background-color: #FFFDF9; border: 1px dashed #D5C7B6; border-radius: 12px; padding: 14px 16px; margin: 20px 0;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; color: #7A6A58; margin-bottom: 6px;">
                  Your Original Inquiry:
                </div>
                <div style="font-size: 12px; line-height: 1.5; color: #5A4838; font-style: italic; white-space: pre-line;">
&ldquo;${originalMessage}&rdquo;
                </div>
              </div>

              <p style="font-size: 13px; line-height: 1.6; color: #5A4838; margin-top: 24px;">
                If you have any further questions or need additional assistance, please reply directly to this email or visit our website.
              </p>

              <p style="font-size: 13px; color: #2C2016; margin-top: 20px; margin-bottom: 0;">
                Warm regards,<br/>
                <strong style="color: #8C6D3B;">Parrot Cards Support Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 36px; background-color: #F8F5EE; border-top: 1px solid rgba(140, 109, 59, 0.15); text-align: center; font-size: 11px; color: #8C6D3B;">
              &copy; ${new Date().getFullYear()} Parrot Cards &bull; Vedic Astronomical Astrological Engine
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const textContent = `Namaste ${customerName || 'Seeker'},\n\nThank you for contacting Parrot Cards.\n\nResponse to your inquiry regarding "${subject}":\n\n${replyText}\n\n---\nYour original message:\n"${originalMessage}"\n\nWarm regards,\nParrot Cards Support Team`;

    const transporter = this.getTransporter();

    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: fromAddress,
          to: toEmail,
          subject: emailSubject,
          html: htmlContent,
          text: textContent,
        });

        console.log(`✨ [EMAIL SERVICE]: Support reply dispatched to ${toEmail} (msgId: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error('❌ [EMAIL SERVICE ERROR]: Failed to send reply email via SMTP:', err.message);
        return { success: false, error: err.message };
      }
    } else {
      console.log(`\n======================================================`);
      console.log(`📧 [EMAIL SERVICE - DISPATCH TO CUSTOMER INBOX]`);
      console.log(`To: ${toEmail} (${customerName})`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Reply Content:\n${replyText}`);
      console.log(`======================================================\n`);
      return { success: true };
    }
  }

  /**
   * Send an instant payment notification email to the admin Gmail whenever an online payment is made via Razorpay
   */
  public async sendPaymentNotificationToAdmin(
    params: AdminPaymentNotificationParams
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const {
      orderType,
      orderId,
      paymentId,
      amountRupees,
      paymentMethod,
      customerName,
      customerEmail,
      customerPhone,
      items,
      shippingAddress,
      notes,
    } = params;

    const adminRecipient =
      process.env.ADMIN_EMAIL ||
      process.env.SMTP_USER ||
      'dparrotcards@gmail.com';

    const fromAddress =
      process.env.SMTP_FROM ||
      (process.env.SMTP_USER
        ? `"Parrot Cards Alerts" <${process.env.SMTP_USER}>`
        : '"Parrot Cards Alerts" <alerts@parrotcards.com>');

    const emailSubject = `💰 [Payment Received] ₹${amountRupees.toLocaleString('en-IN')} via Razorpay - Order ${orderId}`;

    const formattedDate = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const frontendBase =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production' || process.env.VERCEL
        ? 'https://parrot-cards.vercel.app'
        : 'http://localhost:5173');

    const adminLink = `${frontendBase.replace(/\/$/, '')}/admin/orders`;

    const itemsHtml =
      items && items.length > 0
        ? `
      <div style="background-color: #FFFDF9; border: 1px solid #E5D7C6; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #8C6D3B; margin-bottom: 12px; border-bottom: 1px solid #E5D7C6; padding-bottom: 6px;">
          Ordered Products (${items.reduce((acc, it) => acc + (it.quantity || 1), 0)} pcs)
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #E5DDD0; text-align: left; color: #7A6A58; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 6px 0;">Item Name</th>
              <th style="padding: 6px 8px; text-align: center;">Qty</th>
              <th style="padding: 6px 0; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it) => `
              <tr style="border-bottom: 1px solid #F2ECE1;">
                <td style="padding: 8px 0; color: #1A1817; font-weight: 600;">${it.name}</td>
                <td style="padding: 8px 8px; text-align: center; color: #6B635B;">${it.quantity}</td>
                <td style="padding: 8px 0; text-align: right; color: #1A1817; font-weight: 600;">₹${(
                  it.priceRupees * (it.quantity || 1)
                ).toLocaleString('en-IN')}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
        : '';

    const shippingHtml =
      shippingAddress && (shippingAddress.address || shippingAddress.city)
        ? `
      <div style="background-color: #FAF5EE; border: 1px solid #E5D7C6; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #8C6D3B; margin-bottom: 12px; border-bottom: 1px solid #E5D7C6; padding-bottom: 6px;">
          Delivery / Shipping Address
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px;">
          <tr>
            <td style="padding: 4px 0; color: #6B635B; width: 35%;"><strong>Recipient:</strong></td>
            <td style="padding: 4px 0; color: #1A1817; font-weight: 600;">${shippingAddress.fullName || customerName}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B635B;"><strong>Street Address:</strong></td>
            <td style="padding: 4px 0; color: #1A1817;">${shippingAddress.address || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B635B;"><strong>City, State:</strong></td>
            <td style="padding: 4px 0; color: #1A1817;">${shippingAddress.city || '—'}, ${shippingAddress.state || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B635B;"><strong>Pincode:</strong></td>
            <td style="padding: 4px 0; color: #1A1817; font-weight: 600;">${shippingAddress.pincode || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B635B;"><strong>Phone:</strong></td>
            <td style="padding: 4px 0; color: #1A1817;">${shippingAddress.phone || customerPhone || '—'}</td>
          </tr>
        </table>
      </div>
    `
        : '';

    const notesHtml = notes
      ? `
      <div style="background-color: #FFFDF9; border: 1px dashed #D5C7B6; border-radius: 12px; padding: 12px 16px; margin-bottom: 20px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; color: #7A6A58; margin-bottom: 4px;">
          Service / Order Notes:
        </div>
        <div style="font-size: 13px; color: #2C2016;">
          ${notes}
        </div>
      </div>
    `
      : '';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F5EE; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1A1817;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8F5EE; padding: 35px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFDF9; border: 1px solid rgba(140, 109, 59, 0.25); border-radius: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.06); overflow: hidden;">
          <!-- Top Gold / Emerald Accent Bar -->
          <tr>
            <td style="height: 5px; background: linear-gradient(90deg, #10B981, #8C6D3B, #D4AF37);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 28px 36px 14px 36px; text-align: center;">
              <div style="font-size: 26px; color: #8C6D3B; line-height: 1; margin-bottom: 6px;">✦</div>
              <h1 style="margin: 0; font-family: 'Cinzel', Georgia, serif; font-size: 22px; letter-spacing: 2px; color: #1A1817; text-transform: uppercase;">
                Parrot Cards Admin
              </h1>
              <p style="margin: 4px 0 0 0; font-style: italic; font-size: 13px; color: #8C6D3B;">
                Online Payment Notification
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 10px 32px 30px 32px;">
              <!-- Green Success Callout Banner -->
              <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-left: 5px solid #10B981; border-radius: 14px; padding: 18px 20px; margin-bottom: 22px;">
                <div style="margin-bottom: 6px;">
                  <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #065F46;">
                    ● Online Payment Received (Razorpay)
                  </span>
                </div>
                <div style="font-size: 32px; font-weight: 800; color: #047857; font-family: Georgia, serif; line-height: 1.2;">
                  ₹${amountRupees.toLocaleString('en-IN')}
                </div>
                <div style="font-size: 12px; color: #065F46; margin-top: 6px;">
                  Status: <strong style="color: #047857;">PAID &amp; VERIFIED</strong> &bull; ${formattedDate}
                </div>
              </div>

              <!-- Transaction Summary Card -->
              <div style="background-color: #FAF5EE; border: 1px solid #E5D7C6; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #8C6D3B; margin-bottom: 12px; border-bottom: 1px solid #E5D7C6; padding-bottom: 6px;">
                  Transaction Details
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px;">
                  <tr>
                    <td style="padding: 5px 0; color: #6B635B; width: 40%;"><strong>Order ID:</strong></td>
                    <td style="padding: 5px 0; color: #1A1817; font-weight: bold;">${orderId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #6B635B;"><strong>Razorpay Payment ID:</strong></td>
                    <td style="padding: 5px 0; color: #8C6D3B; font-family: monospace; font-weight: bold;">${paymentId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #6B635B;"><strong>Order Type:</strong></td>
                    <td style="padding: 5px 0; color: #1A1817; font-weight: 600;">${orderType}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #6B635B;"><strong>Payment Gateway:</strong></td>
                    <td style="padding: 5px 0; color: #1A1817;">${paymentMethod || 'Online (Razorpay)'}</td>
                  </tr>
                </table>
              </div>

              <!-- Customer Details Card -->
              <div style="background-color: #FFFDF9; border: 1px solid #E5D7C6; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #8C6D3B; margin-bottom: 12px; border-bottom: 1px solid #E5D7C6; padding-bottom: 6px;">
                  Customer Details
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px;">
                  <tr>
                    <td style="padding: 5px 0; color: #6B635B; width: 40%;"><strong>Full Name:</strong></td>
                    <td style="padding: 5px 0; color: #1A1817; font-weight: bold;">${customerName || 'Seeker'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #6B635B;"><strong>Email Address:</strong></td>
                    <td style="padding: 5px 0; color: #1A1817;"><a href="mailto:${customerEmail}" style="color: #8C6D3B; text-decoration: none;">${customerEmail}</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #6B635B;"><strong>Phone Number:</strong></td>
                    <td style="padding: 5px 0; color: #1A1817;">${customerPhone || 'Not provided'}</td>
                  </tr>
                </table>
              </div>

              <!-- Delivery Address if available -->
              ${shippingHtml}

              <!-- Items Table if available -->
              ${itemsHtml}

              <!-- Service notes if available -->
              ${notesHtml}

              <!-- CTA Admin Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0 10px 0;">
                <tr>
                  <td align="center">
                    <a href="${adminLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #8C6D3B, #71562B); color: #FFFDF9; text-decoration: none; padding: 14px 32px; border-radius: 14px; font-weight: bold; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; box-shadow: 0 6px 16px rgba(140, 109, 59, 0.35);">
                      Open Admin Panel &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 36px; background-color: #F8F5EE; border-top: 1px solid rgba(140, 109, 59, 0.15); text-align: center; font-size: 11px; color: #8C6D3B;">
              &copy; ${new Date().getFullYear()} Parrot Cards &bull; Automated Payment Notification System
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const textContent = `
💰 NEW RAZORPAY PAYMENT RECEIVED!

Amount: ₹${amountRupees.toLocaleString('en-IN')}
Status: PAID (Online Razorpay)
Date: ${formattedDate}

TRANSACTION DETAILS:
- Order ID: ${orderId}
- Razorpay Payment ID: ${paymentId}
- Category: ${orderType}
- Method: ${paymentMethod || 'Online (Razorpay)'}

CUSTOMER:
- Name: ${customerName}
- Email: ${customerEmail}
- Phone: ${customerPhone || 'Not provided'}
${
  shippingAddress
    ? `\nDELIVERY ADDRESS:\n${shippingAddress.fullName || customerName}\n${shippingAddress.address || ''}\n${shippingAddress.city || ''}, ${shippingAddress.state || ''} - ${shippingAddress.pincode || ''}\nPhone: ${shippingAddress.phone || customerPhone || ''}`
    : ''
}
${
  items && items.length > 0
    ? `\nITEMS:\n` +
      items.map((it) => `- ${it.name} x ${it.quantity} (₹${(it.priceRupees * it.quantity).toLocaleString('en-IN')})`).join('\n')
    : ''
}
${notes ? `\nNOTES:\n${notes}` : ''}

Admin Portal: ${adminLink}
    `.trim();

    const transporter = this.getTransporter();

    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: fromAddress,
          to: adminRecipient,
          subject: emailSubject,
          html: htmlContent,
          text: textContent,
        });

        console.log(
          `✨ [EMAIL SERVICE]: Admin payment notification dispatched to ${adminRecipient} for Order ${orderId} (msgId: ${info.messageId})`
        );
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error('❌ [EMAIL SERVICE ERROR]: Failed to send admin payment email via SMTP:', err.message);
        return { success: false, error: err.message };
      }
    } else {
      console.log(`\n======================================================`);
      console.log(`📧 [EMAIL SERVICE - ADMIN PAYMENT ALERT (LOCAL/LOG MODE)]`);
      console.log(`To: ${adminRecipient}`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Amount: ₹${amountRupees} | Order: ${orderId} | Payment: ${paymentId}`);
      console.log(`Customer: ${customerName} (${customerEmail})`);
      console.log(`======================================================\n`);
      return { success: true };
    }
  }
}

export const emailService = new EmailService();
