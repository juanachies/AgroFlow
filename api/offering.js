import { manejarCuenta } from '../src/interfaces/http/accountApi.js';

export default function offering(req, res) {
  return manejarCuenta(req, res, 'offering');
}
