/** Port of Home.razor. */
import { cleanupTitle } from '../ical';
import { addDays, dayOfWeek } from '../time';
import { ORDERED_DAYS } from '../config';
import { CopyButton, CustomRadio, CustomSelect } from './components';
import type { MenuEntry, MenuStore, MenuType } from '../types';

const DEFAULT_SLUG = 'det-velkendte';

/** Per-weekday defaults, matching the selected="" logic in Home.razor. */
const DEFAULT_DAY_SLUGS: Record<number, string> = {
  1: DEFAULT_SLUG,
  2: DEFAULT_SLUG,
  3: DEFAULT_SLUG,
  4: 'den-groenne',
  5: DEFAULT_SLUG,
};

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Wed 20 Aug", matching the C# "ddd d MMM" under InvariantCulture. */
function formatShortDate(date: string): string {
  const [, month, day] = date.split('-') as [string, string, string];
  return `${WEEKDAY_ABBR[dayOfWeek(date)]} ${Number(day)} ${MONTH_ABBR[Number(month) - 1]}`;
}

export function formatLastUpdated(updatedAt: string | null, now: Date): string {
  if (!updatedAt) return 'Menu data not available';

  const updated = new Date(updatedAt);
  const minutes = (now.getTime() - updated.getTime()) / 60000;

  if (minutes < 1) return 'Menu updated just now';
  if (minutes < 60) return `Menu updated ${Math.floor(minutes)} minutes ago`;
  if (minutes < 1440) return `Menu updated ${Math.floor(minutes / 60)} hours ago`;

  // Rendered in Copenhagen time so the page reads the same for everyone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Copenhagen',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(updated);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `Menu updated ${get('month')} ${get('day')}, ${get('year')} at ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}

/** Menu entries for the 7-day preview, indexed by menuTypeId then date. */
function buildWeeklyData(store: MenuStore, today: string): Map<number, Map<string, MenuEntry>> {
  const end = addDays(today, 6);
  const byType = new Map<number, Map<string, MenuEntry>>();

  for (const type of store.menuTypes) byType.set(type.id, new Map());

  for (const entry of store.entries) {
    if (entry.date < today || entry.date > end) continue;
    let bucket = byType.get(entry.menuTypeId);
    if (!bucket) {
      bucket = new Map();
      byType.set(entry.menuTypeId, bucket);
    }
    bucket.set(entry.date, entry);
  }

  return byType;
}

/**
 * The payload menu-app.js reads to re-render the preview client side.
 * Shape must stay in step with updateWeeklyPreview() in public/js/menu-app.js.
 */
function menuDataScript(
  menuTypes: MenuType[],
  weeklyData: Map<number, Map<string, MenuEntry>>,
  today: string,
): string {
  const payload = {
    menuTypes: menuTypes.map((mt) => ({ id: mt.id, name: mt.name, slug: mt.slug })),
    weeklyData: Object.fromEntries(
      [...weeklyData].map(([typeId, entries]) => [
        String(typeId),
        Object.fromEntries(
          [...entries].map(([date, entry]) => [
            date,
            { title: cleanupTitle(entry.mainDish), dayName: entry.dayName },
          ]),
        ),
      ]),
    ),
    startDate: today,
  };

  // </script> inside JSON would close the tag early.
  const json = JSON.stringify(payload).replaceAll('</', '<\\/');
  return `<script>window.menuData = ${json};</script>`;
}

export function Home(props: { store: MenuStore; today: string; now: Date }) {
  const { store, today } = props;
  const menuTypes = store.menuTypes.filter((t) => t.isActive);
  const defaultMenuType = menuTypes.find((t) => t.slug === DEFAULT_SLUG) ?? menuTypes[0];
  const weeklyData = buildWeeklyData(store, today);

  const body = (
    <div class="max-w-2xl mx-auto">
      {/* Intro */}
      <section class="text-center mb-12 reveal">
        <p class="font-display text-xl leading-relaxed text-ink-soft max-w-xl mx-auto">
          Choose a menu for each weekday, subscribe once, and the day&rsquo;s dish appears in your
          calendar <em class="text-madder">before you&rsquo;re hungry</em>.
        </p>
      </section>

      {/* Compose */}
      <section class="mb-10 reveal" style="animation-delay: 90ms">
        <div class="card menu-frame px-6 py-8 sm:px-10 sm:py-9">
          <h2 class="section-title mb-7">Compose your calendar</h2>

          <div class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-10 mb-7">
            <CustomRadio name="menuMode" value="simple" checked onchange="toggleMenuMode()">
              One menu, every day
            </CustomRadio>
            <CustomRadio name="menuMode" value="custom" onchange="toggleMenuMode()">
              Mix menus per weekday
            </CustomRadio>
          </div>

          <div id="simpleMode">
            <div class="max-w-sm mx-auto">
              <CustomSelect
                id="simpleMenuSelect"
                class="w-full"
                size="large"
                centered
                onchange="updateCalendarUrl()"
              >
                {menuTypes.map((mt) => (
                  <option value={mt.id} data-slug={mt.slug} selected={mt.slug === DEFAULT_SLUG}>
                    {mt.name}
                  </option>
                ))}
              </CustomSelect>
            </div>
          </div>

          <div id="customMode" class="hidden">
            <div class="max-w-md mx-auto divide-y divide-rule/60">
              {ORDERED_DAYS.map((day) => (
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4 py-3">
                  <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                    {day.label}
                  </span>
                  <CustomSelect
                    class="custom-day-select w-full sm:w-64"
                    size="medium"
                    data-day={day.dayOfWeek}
                    onchange="updateCalendarUrl()"
                  >
                    {menuTypes.map((mt) => (
                      <option
                        value={mt.id}
                        data-slug={mt.slug}
                        selected={mt.slug === DEFAULT_DAY_SLUGS[day.dayOfWeek]}
                      >
                        {mt.name}
                      </option>
                    ))}
                  </CustomSelect>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Week ahead. Server-rendered so crawlers see menu content; menu-app.js
          re-renders this block with identical markup when the selection changes. */}
      <section class="mb-12 reveal" style="animation-delay: 180ms">
        <div class="card menu-frame px-6 py-8 sm:px-10 sm:py-9">
          <h2 class="section-title mb-4">The week ahead</h2>
          <div id="weeklyPreview">
            {defaultMenuType &&
              Array.from({ length: 7 }, (_, i) => {
                const date = addDays(today, i);
                const dow = dayOfWeek(date);
                const isWeekend = dow === 0 || dow === 6;
                const entry = isWeekend ? undefined : weeklyData.get(defaultMenuType.id)?.get(date);
                const title = entry ? cleanupTitle(entry.mainDish) : '';

                return (
                  <div class={`menu-row ${i === 0 ? 'menu-row-today' : ''}`}>
                    <div class="menu-row-date">
                      {i === 0 ? <span class="tag-today">Today</span> : formatShortDate(date)}
                    </div>
                    <div class="menu-row-line">
                      {isWeekend ? (
                        <span class="menu-dish menu-dish-muted">
                          Weekend &mdash; the kitchen rests
                        </span>
                      ) : entry ? (
                        <>
                          <span class="menu-dish" title={title}>
                            {title}
                          </span>
                          <span class="menu-leader"></span>
                          <span class="menu-type">{defaultMenuType.name}</span>
                        </>
                      ) : (
                        <span class="menu-dish menu-dish-muted">No menu published yet</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      {/* Feed URL ticket */}
      <section class="mb-12 reveal" style="animation-delay: 270ms">
        <div class="ticket">
          <span class="ticket-label">&#9988; Your calendar feed</span>
          <div class="flex items-stretch p-1.5 gap-1.5">
            <input type="text" id="calendarUrl" value="" readonly class="copy-input" />
            <CopyButton inputId="calendarUrl" class="btn-primary shrink-0">
              Copy
            </CopyButton>
          </div>
        </div>

        <div class="mt-5 flex justify-center">
          <label class="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              id="alarmCheckbox"
              class="size-4 accent-madder"
              onchange="updateCalendarUrl()"
            />
            <span class="text-[15px] text-ink-soft">Ring a bell five minutes before lunch</span>
          </label>
        </div>
      </section>

      {/* How to subscribe */}
      <section class="mb-10 reveal" style="animation-delay: 360ms">
        <h2 class="section-title mb-7">How to subscribe</h2>
        <div class="grid sm:grid-cols-3 gap-6 sm:gap-0 sm:divide-x divide-rule/70 text-center">
          {[
            ['Google Calendar', 'Settings → Add calendar → From URL'],
            ['Outlook', 'Add calendar → Subscribe from web'],
            ['Apple Calendar', 'File → New Calendar Subscription'],
          ].map(([name, steps]) => (
            <div class="px-4">
              <span class="block font-mono text-[10px] uppercase tracking-[0.16em] text-ink mb-1.5">
                {name}
              </span>
              <span class="text-sm leading-relaxed text-ink-soft">{steps}</span>
            </div>
          ))}
        </div>
        <div class="mt-7 text-center">
          <span class="pill">Updates itself &middot; No app required</span>
        </div>
      </section>

      <div class="mt-12 text-center">
        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          {formatLastUpdated(store.entries.length > 0 ? store.updatedAt : null, props.now)}
        </p>
      </div>
    </div>
  );

  return {
    body,
    script: menuTypes.length > 0 ? menuDataScript(menuTypes, weeklyData, today) : undefined,
  };
}
