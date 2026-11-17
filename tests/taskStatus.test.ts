import { describe, expect, it } from 'vitest';
import { taskStatus } from '../src/admin/taskStatus';
import type { Occurrence } from '../src/lib/types';

const today = '2026-11-17';
let n = 0;
const occ = (p: Partial<Occurrence>): Occurrence => ({
  id: `o${++n}`, household_id: 'h', task_id: 't', worker_id: 'w', due_date: today, flexible: false, status: 'open',
  attempt: 1, reopened_at: null, done_at: null, done_late: null, done_by: null, proof_photo_path: null, steps_done: [],
  task_version: 1, skipped_by: null, skip_reason: null, review_status: null, reviewed_by: null, reviewed_at: null,
  spawned_by: null, created_at: '', ...p,
});
const t = { worker_id: 'w' };

describe('taskStatus', () => {
  it('is overdue when any earlier occurrence is open', () => {
    const s = taskStatus(t, [occ({ due_date: '2026-11-15' }), occ({ due_date: '2026-11-16' }), occ({ status: 'done', done_by: 'w', review_status: 'approved' })], today);
    expect(s.key).toBe('overdue');
    expect(s.detail).toContain('2 overdue');
  });
  it("uses today's occurrence", () => {
    expect(taskStatus(t, [occ({ due_date: '2026-11-16', status: 'done', review_status: 'approved' }), occ({})], today).key).toBe('todo');
    expect(taskStatus(t, [occ({ status: 'done', done_by: 'w', review_status: 'pending' })], today).key).toBe('review');
    expect(taskStatus(t, [occ({ status: 'done', review_status: 'flagged' })], today).key).toBe('flagged');
    expect(taskStatus(t, [occ({ attempt: 2 })], today).key).toBe('redo');
  });
  it('counts an admin tick as done', () => {
    const s = taskStatus(t, [occ({ status: 'done', done_by: 'admin', review_status: 'approved' })], today);
    expect(s.key).toBe('done');
    expect(s.detail).toContain('admin');
  });
  it('treats an open this-week task as to do', () => {
    expect(taskStatus(t, [occ({ due_date: '2026-11-22', flexible: true })], today).key).toBe('todo');
  });
  it('falls back to the latest past occurrence, then upcoming', () => {
    const s = taskStatus(t, [occ({ due_date: '2026-11-16', status: 'done', review_status: 'approved' }), occ({ due_date: '2026-11-18' })], today);
    expect(s.key).toBe('done');
    expect(s.detail).toContain('next');
    expect(taskStatus(t, [occ({ due_date: '2026-11-20' })], today).key).toBe('upcoming');
    expect(taskStatus(t, [], today).key).toBe('none');
  });
});
