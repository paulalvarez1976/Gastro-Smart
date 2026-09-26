import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recorre recursivamente un objeto o array y elimina todas las claves o elementos con valor `undefined`.
 * Previene el error de Firestore: "Unsupported field value: undefined (found in field ...)"
 */
export function limpiarDatosUndefined<T = any>(obj: T): T {
  if (obj === undefined) {
    return undefined as any;
  }
  if (obj === null) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => limpiarDatosUndefined(item)) as any;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = limpiarDatosUndefined(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

/**
 * Utilidad helper guardarDocumento(coleccion, datos, docId?, options?)
 * Recorre el objeto y elimina todas las claves con valor undefined antes de llamar a addDoc/setDoc.
 */
export async function guardarDocumento<T extends Record<string, any>>(
  coleccionNombre: string,
  datos: T,
  docId?: string,
  options: { merge?: boolean } = { merge: true }
): Promise<{ id: string; ref: any; datos: T }> {
  const datosLimpios = limpiarDatosUndefined(datos);
  if (docId) {
    const docRef = doc(db, coleccionNombre, docId);
    await setDoc(docRef, datosLimpios, { merge: options.merge ?? true });
    return { id: docId, ref: docRef, datos: datosLimpios };
  } else {
    const colRef = collection(db, coleccionNombre);
    const docRef = await addDoc(colRef, datosLimpios);
    return { id: docRef.id, ref: docRef, datos: datosLimpios };
  }
}

/**
 * Actualiza un documento garantizando sanitización previa de undefined
 */
export async function actualizarDocumento<T extends Record<string, any>>(
  coleccionNombre: string,
  docId: string,
  datos: Partial<T>
): Promise<void> {
  const datosLimpios = limpiarDatosUndefined(datos);
  const docRef = doc(db, coleccionNombre, docId);
  await updateDoc(docRef, datosLimpios as { [x: string]: any });
}
