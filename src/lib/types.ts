export type Role = 'owner' | 'admin' | 'worker';
export type OccStatus = 'open' | 'done' | 'skipped' | 'missed';
export type ReviewStatus = 'pending' | 'approved' | 'flagged';
export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'anytime';
export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Household {
  id: string;
  name: string;
  timezone: string;
}

export interface Member {
  id: string;
  household_id: string;
  user_id: string | null;
  role: Role;
  display_name: string;
  email: string | null;
  photo_path: string | null;
  active: boolean;
  created_at: string;
}

export interface Schedule {
  schedule_kind: 'once' | 'repeat';
  due_date: string | null;
  freq: Freq | null;
  interval: number;
  by_weekday: number[] | null;
  by_monthday: number[] | null;
  by_month: number[] | null;
  repeat_from: 'schedule' | 'completion';
  starts_on: string;
  ends_on: string | null;
}

export interface Task extends Schedule {
  id: string;
  household_id: string;
  worker_id: string;
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4;
  time_slot: TimeSlot;
  exact_time: string | null;
  photo_required: boolean;
  copy_group_id: string | null;
  linked_from_occurrence_id: string | null;
  link_reason: string | null;
  version: number;
  edited_at: string | null;
  edit_note: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaskMedia {
  id: string;
  task_id: string;
  kind: 'cover' | 'photo' | 'voice';
  storage_path: string;
  position: number;
  transcript: string | null;
}

export interface TaskStep {
  id: string;
  task_id: string;
  position: number;
  label: string;
  photo_path: string | null;
}

export interface Label {
  id: string;
  household_id: string;
  name: string;
  color: string;
}

export interface Occurrence {
  id: string;
  household_id: string;
  task_id: string;
  worker_id: string;
  due_date: string;
  status: OccStatus;
  attempt: number;
  reopened_at: string | null;
  done_at: string | null;
  done_late: boolean | null;
  done_by: string | null;
  proof_photo_path: string | null;
  steps_done: string[];
  task_version: number | null;
  skipped_by: string | null;
  skip_reason: string | null;
  review_status: ReviewStatus | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  spawned_by: string | null;
  created_at: string;
}

export interface OccurrenceAttempt {
  id: string;
  occurrence_id: string;
  attempt: number;
  done_at: string | null;
  done_late: boolean | null;
  proof_photo_path: string | null;
  task_version: number | null;
  review_status: ReviewStatus | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  closed_at: string;
}

export interface Comment {
  id: string;
  household_id: string;
  task_id: string;
  occurrence_id: string | null;
  author_id: string | null;
  kind: 'comment' | 'approve' | 'flag' | 'reopen' | 'followup';
  body: string;
  photo_path: string | null;
  created_at: string;
}

export interface TaskRevision {
  id: string;
  task_id: string;
  version: number;
  snapshot: Task & { media: TaskMedia[]; steps: TaskStep[] };
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

export interface Leave {
  id: string;
  household_id: string;
  worker_id: string;
  from_date: string;
  to_date: string;
  note: string | null;
}

export interface Activity {
  id: number;
  household_id: string;
  actor_id: string | null;
  action: string;
  task_id: string | null;
  occurrence_id: string | null;
  details: Record<string, unknown>;
  at: string;
}

export interface Invite {
  id: string;
  household_id: string;
  email: string;
  created_at: string;
  accepted_at: string | null;
}

/** A task with the media, steps and labels the screens need. */
export interface TaskFull extends Task {
  task_media: TaskMedia[];
  task_steps: TaskStep[];
  task_labels: { label_id: string }[];
}
