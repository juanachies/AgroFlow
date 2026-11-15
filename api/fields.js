import { manejarCuenta } from '../src/interfaces/http/accountApi.js';

export default function fields(req, res) {
  return manejarCuenta(req, res, 'fields');
}
