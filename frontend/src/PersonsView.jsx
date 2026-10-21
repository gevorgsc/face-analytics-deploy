import React from 'react';
import { Upload, UserPlus } from 'lucide-react';
import PersonsGridPro from './PersonsGridPro';

export default function PersonsView({
  API,
  authFetch,
  canDelete,
  canOperate,
  deletePerson,
  load,
  openPersonHistory,
  personViewFilter,
  personsError,
  personsLoading,
  setPersonViewFilter,
  setPreviewImage,
  setShowBulkImport,
  setTab,
  t,
  updateFace,
  updatePerson,
  visiblePersons,
  Card,
}) {
  return (
    <>
      <Card className="section-filter-bar">
        <button
          className={personViewFilter === 'all' ? 'filter-active' : ''}
          onClick={() => setPersonViewFilter('all')}
        >
          {t('registeredPersons')}
        </button>
        <button
          className={personViewFilter === 'employee' ? 'filter-active' : ''}
          onClick={() => setPersonViewFilter('employee')}
        >
          {t('employees')}
        </button>
        <button
          className={personViewFilter === 'vip' ? 'filter-active' : ''}
          onClick={() => setPersonViewFilter('vip')}
        >
          {t('vipClients')}
        </button>
        <button
          className={personViewFilter === 'blacklist' ? 'filter-active' : ''}
          onClick={() => setPersonViewFilter('blacklist')}
        >
          {t('blacklist')}
        </button>
        {canOperate && (
          <button className="register-filter-btn" onClick={() => setTab('register')}>
            <UserPlus size={16} />
            {t('registerPerson')}
          </button>
        )}
        {canOperate && (
          <button className="register-filter-btn" onClick={() => setShowBulkImport(true)}>
            <Upload size={16} /> Bulk Import
          </button>
        )}
      </Card>

      {!canOperate && (
        <Card className="viewer-note">
          {t('viewerNote')}
        </Card>
      )}

      <PersonsGridPro
        persons={visiblePersons}
        updatePerson={updatePerson}
        deletePerson={deletePerson}
        updateFace={updateFace}
        setPreviewImage={setPreviewImage}
        canOperate={canOperate}
        canDelete={canDelete}
        openPersonHistory={openPersonHistory}
        loading={personsLoading}
        error={personsError}
        onRetry={load}
        t={t}
        API={API}
        authFetch={authFetch}
      />
    </>
  );
}
