import raw from 'choo/html/raw';
import qrcode from 'qrcode-generator';

export default function qr(url: string): HTMLElement {
  const gen = qrcode(0, 'L');
  gen.addData(url);
  gen.make();
  const qr = gen.createSvgTag({ scalable: true });
  return raw(qr);
}
