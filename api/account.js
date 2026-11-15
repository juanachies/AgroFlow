import { manejarCuenta } from '../src/interfaces/http/accountApi.js';

export default function account(req, res) {
  return manejarCuenta(req, res, 'account');
}
