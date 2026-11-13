import nodemailer, { Transporter } from 'nodemailer';
import { ENV } from '../config/env';

export interface SendResetEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  devLink?: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured = false;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
      this.isConfigured = true;
    }
  }

  /**
   * Send a branded password reset email with secure token link
   */
  public async sendPasswordResetEmail(
    toEmail: string,
    recipientName: string,
    resetToken: string
  ): Promise<SendResetEmailResult> {
    const frontendBase =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production' || process.env.VERCEL
        ? 'https://parrot-cards.vercel.app'
        : 'http://localhost:5173');

    const resetUrl = `${frontendBase.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const fromAddress =
      process.env.SMTP_FROM ||
      (process.env.SMTP_USER ? `"Parrot Cards" <${process.env.SMTP_USER}>` : '"Parrot Cards" <no-reply@parrotcards.com>');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - Parrot Cards</title>
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
                Cosmic Wisdom & Authentic Vedic Placements
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <h2 style="font-size: 18px; color: #1A1817; margin-bottom: 12px; font-weight: 600;">
                Password Reset Request
              </h2>
              <p style="font-size: 14px; line-height: 1.6; color: #4A4643; margin-bottom: 24px;">
                Namaste <strong>${recipientName || 'Seeker'}</strong>,<br/><br/>
                We received a request to reset the password for your Parrot Cards account (<strong>${toEmail}</strong>). Click the button below to choose a new password:
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

    if (this.isConfigured && this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: fromAddress,
          to: toEmail,
          subject: 'Reset Your Parrot Cards Password',
          html: htmlContent,
          text: `Namaste ${recipientName || 'Seeker'},\n\nWe received a request to reset your password. Please visit this link to set a new password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.`,
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
}

export const emailService = new EmailService();
