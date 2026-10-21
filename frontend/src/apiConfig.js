export const API = import.meta.env.VITE_API_URL || (
  window.location.port === '5173'
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : ''
);

export const PRODUCT_MODULE = import.meta.env.VITE_PRODUCT_MODULE || 'all';
