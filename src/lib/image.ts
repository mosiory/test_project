/**
 * خواندن فایل تصویر و فشرده‌سازی آن در مرورگر پیش از ارسال به سرور.
 * خروجی یک Data URL از نوع JPEG است تا حجم ذخیره‌سازی پایین بماند.
 */
export function readCompressedImage(
  file: File,
  maxSize = 320,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('لطفاً یک فایل تصویری معتبر انتخاب کنید.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('حجم تصویر نباید بیشتر از ۵ مگابایت باشد.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خواندن فایل تصویر انجام نشد.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('فایل انتخاب‌شده یک تصویر معتبر نیست.'));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('پردازش تصویر در مرورگر امکان‌پذیر نیست.'));
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
