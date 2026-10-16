"use client";
// Decode with browser orientation, then redraw pixels: original EXIF/GPS is not
// carried into the JPEG. The server independently validates and normalizes it.
export async function compressPhoto(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    /\.hei[cf]$/i.test(file.name)
  )
    throw new Error(
      "Questo formato non è supportato. Scegli JPEG, PNG o WebP; su iPhone esporta la foto come JPEG o usa Fotocamera > Formati > Più compatibile.",
    );
  if (file.size > 40 * 1024 * 1024)
    throw new Error(
      "La foto supera 40 MB. Esporta una copia più piccola e riprova.",
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "Non riesco ad aprire questa foto. Prova una copia JPEG o PNG.",
    );
  }
  try {
    if (bitmap.width * bitmap.height > 48000000)
      throw new Error(
        "La foto supera 48 megapixel. Esporta una copia più piccola.",
      );
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Fotocamera non disponibile in questo browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(
                new Error("Compressione non riuscita. Scegli un’altra foto."),
              ),
        "image/jpeg",
        0.85,
      ),
    );
    if (blob.size > 10 * 1024 * 1024)
      throw new Error(
        "La foto è ancora troppo grande. Esporta una copia più piccola.",
      );
    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      originalSize: file.size,
    };
  } finally {
    bitmap.close();
  }
}
