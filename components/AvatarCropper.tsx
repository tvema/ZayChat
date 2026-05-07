'use client';

import React, { useState, useCallback } from 'react';
import Cropper, { Point, Area } from 'react-easy-crop';
import { useLanguage } from './LanguageProvider';

interface AvatarCropperProps {
  imageSrc: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Set canvas size to 256x256 as requested
  canvas.width = 256;
  canvas.height = 256;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    256,
    256
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      if (file) resolve(file);
      else reject(new Error('Canvas is empty'));
    }, 'image/jpeg');
  });
}

export default function AvatarCropper({ imageSrc, onCropComplete, onCancel }: AvatarCropperProps) {
  const { t } = useLanguage();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropCompleteHandler = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (croppedAreaPixels) {
      try {
        const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
        onCropComplete(croppedImage);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-md overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-800 shadow-2xl">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{t('modals.cropAvatar')}</h3>
          <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            {t('common.cancel')}
          </button>
        </div>
        
        <div className="relative h-80 w-full bg-neutral-100 dark:bg-neutral-800">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
          />
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('modals.zoom')}</label>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
          <button
            onClick={handleSave}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
          >
            {t('modals.saveAvatar')}
          </button>
        </div>
      </div>
    </div>
  );
}
