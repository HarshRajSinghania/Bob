// Tests Bob's task list: drag-to-reorder, Queued -> In progress -> Delegated -> Completed, clearing.
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const P = Brain.prototype;
let saved = 0;
const job = (id, state, extra = {}) => ({ id, text: `job ${id}`, state, at: Date.now(), sessionId: 's', kind: 'chat', ...extra });
const fake = { queue: [job('run', 'working'), job('a', 'waiting'), job('b', 'waiting'), job('c', 'waiting'), job('old', 'done', { doneAt: Date.now() })], saveQueue() { saved++; }, log() {} };
const order = () => fake.queue.filter((j) => j.state === 'waiting').map((j) => j.id).join(',');

check('drag c in front of a', P.moveJob.call(fake, 'c', 'a') && order() === 'c,a,b', order());
check('drag c to the end of the line', P.moveJob.call(fake, 'c', null) && order() === 'a,b,c', order());
check('the running job can\'t be moved', !P.moveJob.call(fake, 'run', 'a') && fake.queue[0].id === 'run');
check('a waiting job can\'t be dropped in front of a finished one', P.moveJob.call(fake, 'a', 'old') && order() === 'b,c,a', order());
check('moving saves the list', saved >= 3);

const view = (q) => P.queueView.call({ queue: q });
const delegated = job('d', 'working', { steps: [{ hat: 'tinker', label: 'Coding', copy: 'Segfault', state: 'in progress', at: 1 }] });
const v = view([job('w', 'waiting'), job('r', 'working', { steps: [] }), delegated, job('x', 'done', { doneAt: 5 })]);
check('statuses read Queued, In progress, Delegated, Completed', v.map((j) => j.status).join(',') === 'queued,in progress,delegated,completed', v.map((j) => j.status).join(','));
check('a delegated task names the copy doing it', v[2].delegatedTo?.copy === 'Segfault' && v[2].delegatedTo.label === 'Coding');
check('a completed task carries when it finished', v[3].doneAt === 5 && v[3].delegatedTo === null);

const f2 = { queue: [job('w', 'waiting'), job('x', 'done'), job('y', 'cancelled'), job('z', 'failed')], saveQueue() {} };
P.clearCompleted.call(f2);
check('"Clear completed" keeps waiting and failed tasks', f2.queue.map((j) => j.id).join(',') === 'w,z');
check('a waiting task can\'t be removed with ✕ (use Remove, which cancels it)', !P.removeJob.call(f2, 'w') && P.removeJob.call(f2, 'z') && f2.queue.length === 1);

// Retry goes to the back of the line.
const f3 = { queue: [job('f', 'failed'), job('w1', 'waiting')], saveQueue() {}, pump() {} };
P.retryJob.call(f3, 'f');
check('"Try again" puts a task at the back of the line', f3.queue.map((j) => j.id).join(',') === 'w1,f' && f3.queue[1].state === 'waiting');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
