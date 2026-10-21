import { useCallback, useEffect, useState } from 'react';
import { PRODUCT_MODULE } from './apiConfig';

function fallbackLicenseStatus(error) {
  return {
    enforcement_enabled: true,
    valid: false,
    error: error?.message || 'Unable to verify license',
    modules: {
      face_analytics: { licensed: false },
      access_controller: { licensed: false },
      security_center: { licensed: false },
    },
  };
}

export function useLicenseStatus({ token, authFetch }) {
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [appSection, setAppSection] = useState(null);

  const loadLicenseStatus = useCallback(async () => {
    if (!token) {
      setLicenseStatus(null);
      return null;
    }

    setLicenseLoading(true);
    try {
      const response = await authFetch('/api/license/status');
      if (!response.ok) throw new Error(`License status failed (${response.status})`);
      const status = await response.json();
      setLicenseStatus(status);
      return status;
    } catch (error) {
      const status = fallbackLicenseStatus(error);
      setLicenseStatus(status);
      return null;
    } finally {
      setLicenseLoading(false);
    }
  }, [authFetch, token]);

  useEffect(() => {
    loadLicenseStatus();
  }, [loadLicenseStatus]);

  useEffect(() => {
    if (appSection === 'face' && !licenseStatus?.modules?.face_analytics?.licensed) {
      setAppSection(null);
    }
    if (appSection === 'acs' && !licenseStatus?.modules?.access_controller?.licensed) {
      setAppSection(null);
    }
    if (
      appSection === 'security'
      && !licenseStatus?.modules?.face_analytics?.licensed
      && !licenseStatus?.modules?.access_controller?.licensed
    ) {
      setAppSection(null);
    }
    if (
      PRODUCT_MODULE === 'face'
      && appSection === null
      && licenseStatus?.modules?.face_analytics?.licensed
    ) {
      setAppSection('face');
    }
  }, [appSection, licenseStatus]);

  const activateLicense = useCallback(async (document) => {
    const response = await authFetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : data.detail?.message;
      throw new Error(detail || `License activation failed (${response.status})`);
    }
    setLicenseStatus(data);
    return data;
  }, [authFetch]);

  const activateLicenseCode = useCallback(async (code) => {
    const response = await authFetch('/api/license/activate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, product_version: '10.0.0' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : data.detail?.message;
      throw new Error(detail || `Online activation failed (${response.status})`);
    }
    setLicenseStatus(data);
    return data;
  }, [authFetch]);

  const selectAppSection = useCallback((section) => {
    if (section === 'security') {
      if (
        licenseStatus?.modules?.face_analytics?.licensed
        || licenseStatus?.modules?.access_controller?.licensed
      ) setAppSection(section);
      return;
    }
    const moduleName = section === 'acs' ? 'access_controller' : 'face_analytics';
    if (licenseStatus?.modules?.[moduleName]?.licensed) {
      setAppSection(section);
    }
  }, [licenseStatus]);

  return {
    licenseStatus,
    licenseLoading,
    appSection,
    setAppSection,
    selectAppSection,
    activateLicense,
    activateLicenseCode,
    loadLicenseStatus,
  };
}
