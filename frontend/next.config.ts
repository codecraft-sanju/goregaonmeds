/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // (Yeh sabhi domains allow kar dega. Agar specific domain pata hai toh 'res.cloudinary.com' wagarah daal sakte ho)
      },
      {
        protocol: 'http',
        hostname: 'localhost', // Development ke liye
      }
    ],
  },
};

export default nextConfig; // ya module.exports = nextConfig; jo tumhari file mein ho