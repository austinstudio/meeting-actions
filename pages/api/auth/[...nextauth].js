import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Allowlist of emails that can access the app
const ALLOWED_EMAILS = ['austinstudio@gmail.com', 'frankie4fingars@gmail.com', 'renata.miles@gmail.com'];

export const authOptions = {
	providers: [
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			authorization: {
				params: {
					scope: 'openid email profile',
					prompt: 'select_account',
				},
			},
			// Fetch profile from userinfo endpoint to get the picture
			async profile(profile, tokens) {
				const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
					headers: { Authorization: `Bearer ${tokens.access_token}` },
				});
				const userInfo = await res.json();

				return {
					id: profile.sub,
					name: profile.name || userInfo.name || profile.email?.split('@')[0],
					email: profile.email,
					image: userInfo.picture,
				};
			},
		}),
	],
	callbacks: {
		async signIn({ user, account, profile }) {
			// Only allow users with emails in the allowlist
			if (ALLOWED_EMAILS.includes(user.email)) {
				return true;
			}
			// Reject sign-in for non-allowed emails
			return false;
		},
		async jwt({ token, user }) {
			// On initial sign in, capture name and picture from user
			if (user?.image) {
				token.picture = user.image;
			}
			if (user?.name) {
				token.name = user.name;
			}
			return token;
		},
		async session({ session, token }) {
			// Pass user id, name, and picture to session
			if (token?.sub) {
				session.user.id = token.sub;
			}
			if (token?.name) {
				session.user.name = token.name;
			}
			if (token?.picture) {
				session.user.image = token.picture;
			}
			return session;
		},
	},
	pages: {
		signIn: '/login',
		error: '/login', // Redirect to login page on error
	},
	secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
