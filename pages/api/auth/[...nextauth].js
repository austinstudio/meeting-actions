import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Allowlist of emails that can access the app
const ALLOWED_EMAILS = [
  'austinstudio@gmail.com',
];

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile',
        },
      },
      // Fetch profile from userinfo endpoint to get the picture
      async profile(profile, tokens) {
        // Fetch additional profile data including picture from Google
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await res.json();
        console.log('Google userinfo response:', JSON.stringify(userInfo));

        return {
          id: profile.sub,
          name: profile.name,
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
    async jwt({ token, user, account, profile }) {
      // Debug: always log to see what's happening
      console.log('JWT callback - user:', user ? JSON.stringify(user) : 'undefined');
      console.log('JWT callback - profile:', profile ? JSON.stringify(profile) : 'undefined');
      console.log('JWT callback - account:', account ? JSON.stringify(account) : 'undefined');

      // On initial sign in, capture picture from profile or user
      if (user?.image) {
        token.picture = user.image;
      }
      if (profile?.picture) {
        token.picture = profile.picture;
      }

      console.log('JWT callback - final token:', JSON.stringify(token));
      return token;
    },
    async session({ session, token }) {
      // Pass user id and picture to session
      if (token?.sub) {
        session.user.id = token.sub;
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
