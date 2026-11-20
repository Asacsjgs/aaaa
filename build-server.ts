import { build } from 'esbuild';

build({
  entryPoints: ['server.ts'],
  bundle: true,
  outfile: 'server.js',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  external: [
    'vite',
    'express',
    '@tailwindcss/vite',
    'dotenv',
    'hls.js',
    'compression',
    'socket.io',
    'framer-motion',
    'lucide-react',
    'motion',
    'react',
    'react-dom',
    '@google/genai'
  ],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
