import { platform } from '../utils';
import assets from '../../common/assets';

const size = 32;
const loaderWidth = 5;

function drawCircle(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  color: string,
  lineWidth: number,
  outerWidth: number,
  percent: number
): void {
  canvas.width = canvas.height = outerWidth;
  context.translate(outerWidth * 0.5, outerWidth * 0.5);
  context.rotate(-Math.PI * 0.5);
  const radius = (outerWidth - lineWidth) * 0.5;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2 * percent, false);
  context.strokeStyle = color;
  context.lineCap = 'square';
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawNewFavicon(progressRatio: number): string | null {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  drawCircle(canvas, context, '#efefef', loaderWidth, size, 1);
  drawCircle(
    canvas,
    context,
    WEB_UI.COLORS.PRIMARY,
    loaderWidth,
    size,
    progressRatio
  );
  return canvas.toDataURL();
}

function updateFavicon(progressRatio: number): void {
  if (platform() === 'web') {
    const link = document.querySelector<HTMLLinkElement>(
      "link[rel='icon'][sizes='32x32']"
    );
    if (!link) {
      return;
    }
    const progress = progressRatio * 100;
    if (progress === 0 || progress === 100) {
      link.type = 'image/png';
      link.href =
        WEB_UI.CUSTOM_ASSETS.favicon_32px !== ''
          ? WEB_UI.CUSTOM_ASSETS.favicon_32px
          : assets.get('favicon-32x32.png');
      return;
    }

    const href = drawNewFavicon(progressRatio);
    if (href) {
      link.href = href;
    }
  }
}

export default { updateFavicon };
