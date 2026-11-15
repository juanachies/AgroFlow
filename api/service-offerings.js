import { manejarCuenta } from '../src/interfaces/http/accountApi.js';

export default function serviceOfferings(req, res) {
  return manejarCuenta(req, res, 'service-offerings');
}
