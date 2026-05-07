import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').trim();

    if (!user || !pass) {
      throw new Error(`ОШИБКА: Переменные среды SMTP_USER или SMTP_PASS не заданы или пустые.`);
    }

    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587, // STARTTLS
      secure: false, // false for 587, true for 465
      requireTLS: true,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
      auth: {
        user,
        pass,
      },
      logger: false,
      debug: false
    });
  }
  return transporter;
}

/**
 * Sends an email
 */
export async function sendEmail({ to, subject, html }: { to: string, subject: string, html: string }) {
  try {
    const mailer = getTransporter();
    
    // Враппер на случай если nodemailer проигнорирует таймауты
    const sendPromise = mailer.sendMail({
      from: `"ZState Chat" <${(process.env.SMTP_USER || '').trim()}>`,
      to,
      subject,
      html,
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Таймаут: сервер почты (Gmail) не ответил за 10 секунд")), 10000)
    );

    const info = await Promise.race([sendPromise, timeoutPromise]) as any;
    console.log(`Email sent successfully: ${info.messageId}`);
    return info;
  } catch (error: any) {
    console.error('Error sending email:', error);
    throw new Error(`Ошибка SMTP: ${error.message}`);
  }
}
