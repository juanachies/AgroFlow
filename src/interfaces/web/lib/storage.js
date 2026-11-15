// Se mantiene el nombre original de la base para no perder los lotes ya guardados en el navegador.
const DATABASE_NAME = 'marcianos-cosecha';
const DATABASE_VERSION = 1;
const LOTS_STORE = 'lots';
const SNAPSHOTS_STORE = 'weatherSnapshots';

let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Este navegador no permite guardar datos locales.'));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LOTS_STORE)) {
          database.createObjectStore(LOTS_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) {
          database.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'lotId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la base local.'));
      request.onblocked = () => reject(new Error('Cerrá otras pestañas de la aplicación para actualizar el almacenamiento.'));
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

async function requestFromStore(storeName, mode, createRequest) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = createRequest(transaction.objectStore(storeName));
    let result;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error('Falló la operación de almacenamiento.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error('Falló la transacción local.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló la transacción local.'));
  });
}

export function listarLotes() {
  return requestFromStore(LOTS_STORE, 'readonly', (store) => store.getAll());
}

export function guardarLote(lot) {
  return requestFromStore(LOTS_STORE, 'readwrite', (store) => store.put(lot));
}

export function eliminarLote(id) {
  return requestFromStore(LOTS_STORE, 'readwrite', (store) => store.delete(id));
}

export function listarSnapshots() {
  return requestFromStore(SNAPSHOTS_STORE, 'readonly', (store) => store.getAll());
}

export function guardarSnapshot(lotId, snapshot) {
  return requestFromStore(SNAPSHOTS_STORE, 'readwrite', (store) => store.put({ lotId, snapshot }));
}

export function eliminarSnapshot(lotId) {
  return requestFromStore(SNAPSHOTS_STORE, 'readwrite', (store) => store.delete(lotId));
}
