import hash from 'string-hash';
import Account from './ui/account';
import type { AppState, Emitter } from './state';

type Variant = string | number;

interface Experiment {
  eligible(state: AppState): boolean;
  variant(state: AppState): Variant;
  run(variant: Variant, state: AppState, emitter: Emitter): void;
}

const experiments: Record<string, Experiment> = {
  signin_button_color: {
    eligible: function () {
      return true;
    },
    variant: function () {
      return ['white-primary', 'primary', 'white-violet', 'violet'][
        Math.floor(Math.random() * 4)
      ];
    },
    run: function (variant, state) {
      const account = state.cache(Account, 'account');
      account.buttonClass = String(variant);
    }
  }
};

//Returns a number between 0 and 1
export function luckyNumber(str: string): number {
  return hash(str) / 0xffffffff;
}

function checkExperiments(state: AppState, emitter: Emitter): void {
  const all = Object.keys(experiments);
  const id = all.find(id => experiments[id].eligible(state));
  if (id) {
    const variant = experiments[id].variant(state);
    state.storage.enroll(id, variant);
    experiments[id].run(variant, state, emitter);
  }
}

export default function initialize(state: AppState, emitter: Emitter): void {
  emitter.on('DOMContentLoaded', () => {
    const xp = state.query.x ? experiments[state.query.x] : undefined;
    if (xp) {
      xp.run(Number(state.query.v), state, emitter);
    }
  });
  const enrolled = state.storage.enrolled;
  // single experiment per session for now
  const id = Object.keys(enrolled)[0];
  if (id && Object.prototype.hasOwnProperty.call(experiments, id)) {
    experiments[id].run(enrolled[id], state, emitter);
  } else {
    checkExperiments(state, emitter);
  }
}
