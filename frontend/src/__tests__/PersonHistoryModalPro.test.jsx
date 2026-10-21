import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PersonHistoryModalPro from '../PersonHistoryModalPro';

describe('PersonHistoryModalPro', () => {
  it('uses server totals and requests the next page', () => {
    const onLoadMore = vi.fn();
    render(
      <PersonHistoryModalPro
        person={{ id: 7, full_name: 'Test Person', person_type: 'employee' }}
        events={[]}
        serverStats={{
          total_events: 450,
          today_events: 12,
          last_7_days: 80,
          low_quality_events: 3,
          camera_counts: [],
        }}
        totalEvents={450}
        loading={false}
        loadingMore={false}
        hasMore
        onLoadMore={onLoadMore}
        onClose={() => {}}
        setPreviewImage={() => {}}
        t={key => key}
        API=""
        authFetch={vi.fn()}
      />,
    );

    expect(screen.getByText('450')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'loadMore' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
