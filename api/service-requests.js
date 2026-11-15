import { manejarCuenta } from '../src/interfaces/http/accountApi.js';

export default function serviceRequests(req, res) {
  return manejarCuenta(req, res, 'service-requests');
}
