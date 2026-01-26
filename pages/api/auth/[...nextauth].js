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
    async session({ session, token }) {
      // Add user id to session for convenience
      if (token?.sub) {
        session.user.id = token.sub;
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
