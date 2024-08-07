import { SvelteKitAuth } from "@auth/sveltekit"
import Nodemailer from "@auth/sveltekit/providers/nodemailer"
import { SMTP_USER, SMTP_PWD, SMTP_ENDPOINT, SMTP_TLS_PORT, AUTH_SECRET, AUTH_EMAIL_FROM } from "$env/static/private";
import PostgresAdapter from "@auth/pg-adapter";
import { error, redirect } from '@sveltejs/kit';
import { authDbPool } from "$lib/server/db/db";
import { createTransport } from "nodemailer";

export async function authorizationHandle({ event, resolve }) {

  if (!event.route.id) {
    console.log("invalid route");
    error(404, {
      message: 'Not found'
    });
    return;
  }

  if (event.route.id.startsWith('/board')) {
    //console.log("Requires authentication");
    const session = await event.locals.auth();

    if (!session) {
      throw redirect(307, `/login?source=${event.route.id}`);
    }
  }

  //TODO: more routes


  return resolve(event);
}

function html(params: { url: string; host: string; theme: Theme }) {
  const { url, host, theme } = params

  const escapedHost = host.replace(/\./g, "&#8203;.")

  const brandColor = theme.brandColor || "#346df1"
  const color = {
    background: "#f9f9f9",
    text: "#444",
    mainBackground: "#fff",
    buttonBackground: brandColor,
    buttonBorder: brandColor,
    buttonText: theme.buttonText || "#fff",
  }

  return `
  <body style="background: ${color.background};">
    <table width="100%" border="0" cellspacing="20" cellpadding="0"
      style="background: ${color.mainBackground}; max-width: 600px; margin: auto; border-radius: 10px;">
      <tr>
        <td align="center"
          style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
          Anmelden bei <strong>${escapedHost}</strong>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 20px 0;">
          <table border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td align="center" style="border-radius: 5px;" bgcolor="${color.buttonBackground}"><a href="${url}"
                  target="_blank"
                  style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${color.buttonText}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${color.buttonBorder}; display: inline-block; font-weight: bold;">
                  Anmelden</a></td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center"
          style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
          <p>
          Sie erhalten diese Nachricht als Teil des Anmeldevorganges bei <strong>${escapedHost}</strong>.
            </p>
            <p>
            Wenn Sie diese Nachricht nicht angefordert haben, können Sie sie einfach ignorieren.
            </p>
        </td>
      </tr>
    </table>
  </body>
  `
}

// Email Text body (fallback for email clients that don't render HTML, e.g. feature phones)
function text({ url, host }: { url: string; host: string }) {
  return `Anmelden bei ${host}\n${url}\n\n`
}

const providers = [
  Nodemailer({
    server: {
      host: SMTP_ENDPOINT,
      port: SMTP_TLS_PORT,
      secure: true,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PWD
      }
    },
    from: AUTH_EMAIL_FROM,
    async sendVerificationRequest({
      identifier,
      url,
      provider,
      theme
    }) {
      const { host } = new URL(url)
      // NOTE: You are not required to use `nodemailer`, use whatever you want.
      const transport = createTransport(provider.server)
      const result = await transport.sendMail({
        to: identifier,
        from: provider.from,
        subject: `Ihre Anmeldung bei ${host}`,
        text: text({ url, host }),
        html: html({ url, host, theme }),
      })
      const failed = result.rejected.concat(result.pending).filter(Boolean)
      if (failed.length) {
        throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`)
      }
    },
  }),
];


// request -> authjs -> authorize -> page
export const { handle, signIn, signOut } = SvelteKitAuth({
  trustHost: true,
  secret: AUTH_SECRET,
  adapter: PostgresAdapter(authDbPool),
  pages: {
    signIn: '/login',
    //signOut: '/login',
    verifyRequest: '/verify'
  },
  providers
});
