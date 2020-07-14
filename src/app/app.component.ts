import { Component, OnDestroy } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';

import { GEARS } from './gears';
import { FormGroup, FormControl } from '@angular/forms';
import { Subscription, BehaviorSubject } from 'rxjs';
import { debounceTime, map, shareReplay, tap } from 'rxjs/operators';

const CATEGORIES = Object.keys(GEARS);
const ATTRIBUTES = ['Agility', 'Stamina', 'Serve', 'Volley', 'Forehand', 'Backhand', 'Total'];
const STARTERS = [
  ['Character', 'Jonah'],
  ['Racket', 'Starter Racket'],
  ['Grip', 'Starter Grip'],
  ['Shoe', 'Starter Shoes'],
  ['Wristband', 'Starter Band'],
  ['Nutrition', 'Starter Protein'],
  ['Workout', 'Starter Training'],
];

interface LevelByItem {
  /** The current level of each item. */
  [itemName: string]: number;
}

interface ItemsByCategory {
  /** The available items for each category. */
  [category: string]: LevelByItem;
}

interface AttributePower {
  /** The power of this attribute name. */
  [attrName: string]: number;
}

interface Config {
  /** The equipped item names of each category. */
  itemNames: string[];

  /** The power of each available item in a category. */
  itemPowers: { [itemName: string]: AttributePower }[];

  /** The level of each available item in a category. */
  itemLevel: { [itemName: string]: number }[];

  /** The maximum power for the rest of the categories on the right. */
  maxRemainingPowers: AttributePower[];

  powers: {
    [attr: string]: {
      /** Minimum power requirement. */
      minimum: number;

      /** Maximum power requirement. */
      maximum: number;

      /** The current total power. */
      current: number;
    }
  };

  /** The top N configs based on total powers. */
  topConfigs: Config[];
}

function initialConfig(inventories: ItemsByCategory, configs: any) {
  localStorage.inventories = JSON.stringify(inventories);
  localStorage.configs = JSON.stringify(configs);
  const config: Config = {
    itemNames: [],
    itemPowers: [],
    itemLevel: [],
    maxRemainingPowers: [],
    powers: {},
    topConfigs: []
  };
  for (const attr of ATTRIBUTES) {
    let minimum = +configs[attr];
    let maximum = 999;
    const v = configs[attr] + '';
    if (v.indexOf('-') !== -1) {
      const range = v.split('-');
      minimum = +range[0];
      maximum = +range[1];
    }
    config.powers[attr] = { minimum, maximum, current: 0 };
  }
  for (let c = CATEGORIES.length - 1; c >= 0; c--) {
    const cat = CATEGORIES[c];
    const maxAttr = {};
    const itemPowers = config.itemPowers[c] = {};
    const itemLevel = config.itemLevel[c] = {};
    for (const [name, inventoryLevel] of Object.entries<number>(inventories[cat] ?? {})) {
      const level = Math.min(inventoryLevel, configs.levelCap);
      const item = GEARS[cat].find(item => item.name === name);
      const attrPowers = itemPowers[name] = {};
      itemLevel[name] = level + 1;
      if (!item?.skills) {
        alert('Item not found: ' + name);
        continue;
      }
      for (const [attr, values] of Object.entries<number[]>(item.skills)) {
        attrPowers[attr] = values[level];
        maxAttr[attr] = Math.max(maxAttr[attr] ?? 0, values[level]);
      }
    }
    const rem = config.maxRemainingPowers[c] = {};
    for (const attr of ATTRIBUTES) {
      const nextRem = (c + 1 < CATEGORIES.length) ? config.maxRemainingPowers[c + 1][attr] : 0;
      rem[attr] = nextRem + maxAttr[attr];
    }
  }
  return config;
}

function saveTopConfig(config: Config) {
  if (!config.powers['Total'].current) return;
  const configs = config.topConfigs;
  configs.push({
    itemNames: [...config.itemNames],
    itemPowers: config.itemPowers,
    itemLevel: config.itemLevel,
    maxRemainingPowers: [],
    powers: JSON.parse(JSON.stringify(config.powers)),
    topConfigs: []
  });
  for (let i = configs.length - 2; i >= 0; i--) {
    if (configs[i].powers['Total'].current < configs[i + 1].powers['Total'].current) {
      const t = configs[i];
      configs[i] = configs[i + 1];
      configs[i + 1] = t;
    }
  }
  if (configs.length > 25) {
    configs.pop();
  }
  return config;
}

function computeBestConfigs(config: Config) {
  const catIdx = config.itemNames.length;
  for (const attr of ATTRIBUTES) {
    const p = config.powers[attr];
    const maxRemainer = (catIdx >= CATEGORIES.length) ? 0 : config.maxRemainingPowers[catIdx][attr];
    if (p.current + maxRemainer < p.minimum) return config;
    if (p.current > p.maximum) return config;
  }

  if (catIdx >= CATEGORIES.length) return saveTopConfig(config);

  config.itemNames.push('');
  for (const [itemName, attrPowers] of Object.entries<AttributePower>(config.itemPowers[catIdx])) {
    config.itemNames[catIdx] = itemName;
    for (const [attr, power] of Object.entries<number>(attrPowers)) {
      config.powers[attr].current += power;
      if (config.powers[attr].minimum > 0) {
        config.powers['Total'].current += power;
      }
    }

    computeBestConfigs(config);

    for (const [attr, power] of Object.entries<number>(attrPowers)) {
      config.powers[attr].current -= power;
      if (config.powers[attr].minimum > 0) {
        config.powers['Total'].current -= power;
      }
    }
  }
  config.itemNames.pop();
  return config;
}

@Component({
  selector: 'app-root',
  animations: [
    trigger('toggleClick', [
      state('true', style({})),
      state('false', style({
        opacity: 1,
        backgroundColor: 'gray'
      })),
      transition('true => false', animate('0.25s')),
      transition('false => true', animate('0.1s'))
    ])
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy {
  CATEGORIES = CATEGORIES;
  ATTRIBUTES = ATTRIBUTES;
  gears = [];
  inventories: ItemsByCategory;
  formGroup: FormGroup;

  subscription: Subscription;

  computeTrigger$ = new BehaviorSubject<string>('');
  isOpen = true;

  bestConfigs$ = this.computeTrigger$.pipe(
    tap(() => { this.isOpen = false; }),
    debounceTime(1000),
    map(() => initialConfig(this.inventories, this.formGroup.value)),
    map(config => {
      const top = computeBestConfigs(config).topConfigs;
      this.selectedConfig = top[0];
      this.isOpen = true;
      this.configJson = JSON.stringify({
        "inventories": JSON.parse(localStorage.inventories),
        "configs": JSON.parse(localStorage.configs),
      }, null, 2);
      return top;
    }),
    shareReplay(1));

  selectedConfig: Config | null = null;

  mode = 'graph';
  configJson = '';

  constructor() {
    this.inventories = JSON.parse(localStorage.inventories ?? '{}');
    for (const [category, itemName] of STARTERS) {
      if (this.inventories[category]?.[itemName] === undefined) {
        this.setInventory(category, itemName, 0);
      }
    }

    const configs = JSON.parse(localStorage.configs ?? '{}');
    for (const attr of ATTRIBUTES)
      configs[attr] = new FormControl(configs[attr] ?? 1);
    configs['levelCap'] = new FormControl(configs['levelCap'] ?? 12);
    this.formGroup = new FormGroup(configs);

    for (const category of CATEGORIES) {
      const items = [];
      const value = GEARS[category];
      if (category !== 'Character') {
        value.sort((a, b) => a.foundIn < b.foundIn ? -1 : 1);
      }
      for (const item of value) {
        const attrs = [];
        const total = [];
        for (const [attr, skills] of Object.entries<any>(item.skills)) {
          const i = ATTRIBUTES.indexOf(attr);
          if (i === -1 || i === ATTRIBUTES.length - 1)
            alert('Unknown attribute: ' + attr);
          attrs.push({ attr, skills });
          for (let i = 0; i < skills.length; i++) {
            total[i] = (total[i] ?? 0) + skills[i];
          }
        }
        items.push({ ...item, attrs, total });
      }
      this.gears.push({ category, items });
    }

    this.subscription = this.formGroup.valueChanges
      .subscribe(() => this.computeTrigger$.next(''));
    this.computeTrigger$.next('');
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  get levelCap(): any {
    return this.formGroup.get('levelCap').value;
  }

  toggleMode() {
    this.mode = this.mode === 'JSON' ? 'graph' : 'JSON';
  }

  updateJson(val) {
    try {
      const json = JSON.parse(val);
      this.inventories = json.inventories;
      this.formGroup.setValue(json.configs);
      this.computeTrigger$.next('');
      console.log('Changed configs', json);
    } catch (e) {
      alert(e);
      console.error(e);
    }
  }

  setInventory(category: string, name: string, level: number) {
    let cat = this.inventories[category];
    if (!cat) cat = this.inventories[category] = {};
    if (cat[name] === level) {
      delete cat[name];
    } else {
      cat[name] = level;
    }
    this.computeTrigger$.next('');
  }

  hasAtLeastOneInventory() {
    for (const cat of Object.values(this.inventories))
      if (Object.keys(cat).length > 0) return true;
    return false;
  }

  hasInventory(category: string, name: string, level: number) {
    return this.inventories?.[category]?.[name] === level;
  }

  stats(s: any) {
    const arr = [];
    for (const attr of ATTRIBUTES) {
      if (s && s[attr]) {
        arr.push(`${attr.substr(0, 2)}:${s[attr]}`);
      }
    }
    return arr;
  }

  isRangeValue(attr: string) {
    const strValue = this.formGroup.get(attr).value + '';
    return strValue.indexOf('-') !== -1;
  }

  isInvalidValue(attr: string) {
    const re = /^\d{1,3}(-\d{0,3})?$/;
    return !re.exec(this.formGroup.get(attr).value);
  }

  toggleFormat(attr: string) {
    const strValue = this.formGroup.get(attr).value + '';
    const newValue = this.isRangeValue(attr) ? +strValue.split('-')[0] : (strValue + '-999');
    this.formGroup.get(attr).setValue(newValue);
  }

  isIgnored(attr: string) {
    return this.formGroup.get(attr).value === 0;
  }

  formatUpgrade(s: string) {
    s = s.toLowerCase();
    if (!s) return '?';
    if (s === '/' || s === 'starter') return '/';
    if (s[s.length - 1] === 'k') s = s.substring(0, s.length - 1);
    else if (s.length > 3) s = s.substring(0, s.length - 3);
    if (s.length > 3) {
      const i = s.indexOf('.');
      s = i === -1 ? s : s.substring(0, i);
    }
    return s;
  }
}
