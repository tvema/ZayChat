import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
          color: 'white',
          fontSize: 280,
          fontWeight: 800,
          fontFamily: 'sans-serif',
          borderRadius: 128,
        }}
      >
        Z
      </div>
    ),
    { ...size }
  );
}
