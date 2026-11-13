import { PyJHoraProvider } from './PyJHoraProvider';

/**
 * @deprecated Jagannatha Hora external API has been deprecated and replaced with PyJHora.
 * This class now aliases directly to PyJHoraProvider.
 */
export class JagannathaHoraProvider extends PyJHoraProvider {
  public override readonly name = 'pyjhora';
}
