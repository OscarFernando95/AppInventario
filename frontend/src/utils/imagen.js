/**
 * Reduce una foto a un cuadrito liviano (JPEG) para guardarla junto al producto sin llenar la base de datos:
 * máximo `lado` píxeles por lado y calidad media. Devuelve un data URL.
 */
export function redimensionarImagen(archivo, { lado = 240, calidad = 0.72 } = {}) {
  return new Promise((resolver, rechazar) => {
    if (!archivo || !/^image\//.test(archivo.type)) return rechazar(new Error('Elige un archivo de imagen.'));
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolver(canvas.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}
