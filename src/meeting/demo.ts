import type { Meeting, MeetingEvent, NoteBlock, Segment } from './model';

const date = '2026-11-10T09:00:00+01:00';
const segments: Segment[] = [
  { id: 's1', start: 0, end: 95, text: 'Let’s review Q2 growth and agree on priorities for the next quarter. The report shows revenue of €1.24 million, compared with €1.08 million in Q1. Those are the totals from the finance export.', channel: 'demo', final: true },
  { id: 's2', start: 96, end: 210, text: 'The European market contributed €720,000, North America €410,000, and other markets €110,000 in Q2. We should compare the underlying report before making a forecast.', channel: 'demo', final: true },
  { id: 's3', start: 211, end: 365, text: 'One proposal is to increase acquisition spend by twenty percent. We might also test a new pricing page. Neither change is approved yet.', channel: 'demo', final: true },
  { id: 's4', start: 366, end: 510, text: 'I’m concerned that onboarding is still the bottleneck. Increasing acquisition now could bring more people into the same friction. Can we address activation first?', channel: 'demo', final: true },
  { id: 's5', start: 511, end: 685, text: 'An alternative would be to keep acquisition spend flat and run a two-week onboarding experiment. We could simplify the first three steps and measure activation.', channel: 'demo', final: true },
  { id: 's6', start: 686, end: 820, text: 'Agreed. We have decided to keep acquisition spend unchanged and prioritize the two-week onboarding experiment. We are not approving a pricing change today.', channel: 'demo', final: true },
  { id: 's7', start: 821, end: 1020, text: 'The design team will share the simplified onboarding flow by Friday, November 13. The analytics team will define the activation baseline by Thursday, November 12. We will review the experiment after two weeks.', channel: 'demo', final: true },
  { id: 's8', start: 1021, end: 1162, text: 'We still need to establish which activation measure best predicts retention. The analytics team should bring a recommendation to the experiment review. There is no final metric decision yet.', channel: 'demo', final: true },
];
function event(id: string, type: MeetingEvent['type'], title: string, text: string, si: number, topic: string, relatedIds: string[], state: MeetingEvent['evidenceState'] = 'explicit', extra: Partial<MeetingEvent> = {}): MeetingEvent {
  return { id, meetingId: 'demo-q2', type, title, text, start: segments[si].start, end: segments[si].end,
    topic, relatedIds, evidenceIds: [segments[si].id], evidenceState: state, done: false, createdAt: date, updatedAt: date, ...extra };
}
const events: MeetingEvent[] = [
  event('e1', 'topic_started', 'Q2 performance', 'Revenue and market performance in the second quarter.', 0, 'Q2 performance', []),
  event('e9', 'clarification', 'Revenue by market', 'Q2 revenue: Europe €720k, North America €410k, other markets €110k.', 1, 'Q2 performance', ['e1']),
  event('e2', 'proposal', 'Increase acquisition', 'Proposed: increase acquisition spend by 20%. Not approved.', 2, 'Growth strategy', ['e1'], 'unresolved'),
  event('e3', 'objection', 'Fix activation first', 'Onboarding friction may limit the return on additional acquisition.', 3, 'Growth strategy', ['e2']),
  event('e4', 'alternative', 'An onboarding experiment', 'Keep acquisition spend flat and test a simpler onboarding flow for two weeks.', 4, 'Growth strategy', ['e3']),
  event('e5', 'decision', 'Prioritize onboarding', 'Keep acquisition spend unchanged. Prioritize a two-week onboarding experiment.', 5, 'Growth strategy', ['e4']),
  event('e6', 'action_item', 'Share the new flow', 'Design team to share the simplified onboarding flow by November 13.', 6, 'Next steps', ['e5'], 'explicit', { owner: 'Design team', due: '2026-11-13' }),
  event('e7', 'action_item', 'Define the baseline', 'Analytics team to define the activation baseline by November 12.', 6, 'Next steps', ['e5'], 'explicit', { owner: 'Analytics team', due: '2026-11-12' }),
  event('e8', 'question', 'Which activation metric?', 'Which activation measure best predicts retention? No final metric has been selected.', 7, 'Next steps', ['e5'], 'unresolved'),
];
const blocks: NoteBlock[] = [
  { id: 'b1', title: 'At a glance', html: '<p>Q2 revenue increased to <strong>€1.24m</strong>, up from €1.08m in Q1. The team aligned on improving onboarding before increasing acquisition spend.</p>', eventIds: ['e1', 'e5'], revision: 1, editedBy: 'synthesis', updatedAt: date },
  { id: 'b2', title: 'Q2 performance', html: '<ul><li>Calculated from the stated totals: revenue grew by approximately <strong>14.8%</strong> quarter over quarter.</li><li>Europe led with €720k, followed by North America at €410k.</li><li>Validate the finance export before using these numbers in a forecast.</li></ul>', eventIds: ['e1', 'e9'], revision: 1, editedBy: 'synthesis', updatedAt: date },
  { id: 'b3', title: 'Growth strategy', html: '<p>Increasing acquisition spend was proposed, then challenged because of onboarding friction. A simpler onboarding flow will be tested first.</p><p>The pricing-page idea remains a proposal. No pricing change was approved.</p>', eventIds: ['e2', 'e3', 'e4'], revision: 1, editedBy: 'synthesis', updatedAt: date },
  { id: 'b4', title: 'The decision', html: '<p>Keep acquisition spend flat and prioritize a <strong>two-week onboarding experiment</strong>. Review the results before revisiting spend.</p>', eventIds: ['e5'], revision: 1, editedBy: 'synthesis', updatedAt: date },
];
export const demoMeeting: Meeting = { id: 'demo-q2', title: 'Q2 growth & priorities', date, duration: 1162, status: 'complete', mode: 'demo', participants: [], tags: ['Strategy', 'Quarterly review'], segments, events, blocks };
export function sampleMeetings(): Meeting[] {
  return [structuredClone(demoMeeting), {
    id: 'demo-product', title: 'Product direction', date: '2026-11-06T14:00:00+01:00', duration: 1540,
    status: 'complete', mode: 'demo', participants: [], tags: ['Product'], segments: [{ id: 'p-s1', start: 180, end: 240, text: 'We have agreed to run a small onboarding experiment before expanding the launch. The exact experiment scope will be discussed in the quarterly review.', channel: 'demo', final: true }],
    events: [{ ...events[4], id: 'p-e1', meetingId: 'demo-product', title: 'Test before expanding', text: 'Run a small onboarding experiment before expanding the launch.', start: 180, end: 240, relatedIds: [], evidenceIds: ['p-s1'] }],
    blocks: [{ ...blocks[0], id: 'p-b1', title: 'Summary', html: '<p>The next launch will begin with an onboarding experiment. The scope is still open for discussion at the quarterly review.</p>', eventIds: ['p-e1'] }],
  }];
}
export function replayFrame(meeting: Meeting, index: number): Meeting {
  const base = demoMeeting;
  const nextSegment = base.segments[index];
  if (!nextSegment) return meeting;
  const segments = [...meeting.segments.filter(s => s.id !== nextSegment.id), structuredClone(nextSegment)];
  const visible = new Set(segments.map(s => s.id));
  const events = base.events.filter(e => e.evidenceIds.every(id => visible.has(id))).map(e => ({ ...e, meetingId: meeting.id }));
  const generated = base.blocks.filter(b => b.eventIds.every(id => events.some(e => e.id === id))).map(b => structuredClone(b));
  const merged = generated.map(b => meeting.blocks.find(old => old.id === b.id && old.editedBy === 'user') ?? b);
  const manual = meeting.blocks.filter(b => b.editedBy === 'user' && !generated.some(n => n.id === b.id));
  return { ...meeting, segments, events: events.map(e => ({ ...e, done: meeting.events.find(old => old.id === e.id)?.done ?? false })), blocks: [...merged, ...manual], duration: nextSegment.end };
}
