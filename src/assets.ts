export interface GameAssets {
  wallTexture: HTMLImageElement;
  floorTexture: HTMLImageElement;
  enemySprite: HTMLImageElement;
  weaponSprite: HTMLImageElement;
  hudBar: HTMLImageElement;
  face: HTMLImageElement;
  faceDead: HTMLImageElement;
}

export async function loadGameAssets(): Promise<GameAssets> {
  const [wallTexture, floorTexture, enemySprite, weaponSprite, hudBar, face, faceDead] =
    await Promise.all([
      loadImage('/assets/freedoom/wall.png'),
      loadImage('/assets/freedoom/floor.png'),
      loadImage('/assets/freedoom/enemy.png'),
      loadImage('/assets/freedoom/weapon.png'),
      loadImage('/assets/freedoom/hudbar.png'),
      loadImage('/assets/freedoom/face.png'),
      loadImage('/assets/freedoom/face-dead.png'),
    ]);

  return {
    wallTexture,
    floorTexture,
    enemySprite,
    weaponSprite,
    hudBar,
    face,
    faceDead,
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load asset: ${src}`));
    image.src = src;
  });
}
