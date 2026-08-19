/** Port of the shared Razor components: CustomSelect, CustomRadio, CopyButton. */
import type { Child } from 'hono/jsx';

type SelectSize = 'small' | 'medium' | 'large';
type RadioSize = 'small' | 'medium' | 'large';

const SELECT_BASE =
  'appearance-none cursor-pointer bg-transparent font-display text-ink ' +
  'border-0 border-b border-ink-faint rounded-none ' +
  'hover:border-ink focus:border-madder focus:outline-none ' +
  'transition-colors duration-200 ' +
  'custom-select-arrow bg-no-repeat';

const SELECT_SIZES: Record<SelectSize, string> = {
  small: 'px-1 py-1.5 pr-7 text-sm custom-select-small',
  large: 'px-2 py-2.5 pr-9 text-xl custom-select-large',
  medium: 'px-1 py-2 pr-8 text-base custom-select-medium',
};

export function CustomSelect(props: {
  children?: Child;
  class?: string;
  size?: SelectSize;
  centered?: boolean;
  id?: string;
  onchange?: string;
  'data-day'?: number;
}) {
  const { children, class: extra = '', size = 'medium', centered, ...rest } = props;
  const classes = [SELECT_BASE, SELECT_SIZES[size], centered ? 'text-center' : '', extra]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <select class={classes} {...rest}>
      {children}
    </select>
  );
}

const RADIO_INPUT_BASE =
  'peer bg-transparent border-ink-faint ' +
  'transition-all duration-200 appearance-none rounded-full border ' +
  'checked:bg-madder checked:border-madder ' +
  'hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-madder ' +
  'relative cursor-pointer ' +
  "before:content-[''] before:absolute before:inset-[3px] before:rounded-full " +
  'before:bg-cream before:scale-0 before:transition-transform ' +
  'checked:before:scale-100';

const RADIO_INPUT_SIZES: Record<RadioSize, string> = {
  small: 'w-3 h-3 mr-2',
  large: 'w-5 h-5 mr-4',
  medium: 'w-4 h-4 mr-3',
};

const RADIO_TEXT_SIZES: Record<RadioSize, string> = {
  small: 'text-sm',
  large: 'text-lg',
  medium: 'text-base',
};

export function CustomRadio(props: {
  children?: Child;
  class?: string;
  size?: RadioSize;
  name: string;
  value: string;
  checked?: boolean;
  onchange?: string;
}) {
  const { children, class: extra = '', size = 'medium', ...rest } = props;

  return (
    <label class={`flex items-center cursor-pointer ${extra}`.trim()}>
      <input type="radio" class={`${RADIO_INPUT_BASE} ${RADIO_INPUT_SIZES[size]}`} {...rest} />
      <span
        class={
          'font-display text-ink-soft peer-checked:text-ink peer-checked:font-medium transition-colors ' +
          RADIO_TEXT_SIZES[size]
        }
      >
        {children}
      </span>
    </label>
  );
}

export function CopyButton(props: { children?: Child; inputId: string; class?: string }) {
  return (
    <button
      onclick={`copyToClipboard(document.getElementById('${props.inputId}').value)`}
      class={props.class ?? 'btn-primary'}
      title="Copy to clipboard"
    >
      {props.children}
    </button>
  );
}

/** The GitHub mark, shared by the header and footer. */
export function GithubIcon(props: { class: string }) {
  return (
    <svg class={props.class} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill-rule="evenodd"
        d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
        clip-rule="evenodd"
      />
    </svg>
  );
}
