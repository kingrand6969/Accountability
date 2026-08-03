import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsPro } from '../pro/ProProvider';
import {
  addFixedCost,
  archiveItem,
  addRecipeLine,
  BILL_PRESETS,
  COST_CHIPS,
  createBusiness,
  createItem,
  createSupply,
  archiveBusiness,
  endFixedCost,
  getDashboard,
  listBusinesses,
  listFixedCosts,
  listItemsCosted,
  listRecipe,
  listSupplies,
  LOSS_REASONS,
  PRESETS,
  recordCost,
  recordLoss,
  recordSale,
  removeRecipeLine,
  undoSale,
  addTenant,
  endTenant,
  listTenants,
  markRentPaid,
  rentStatus,
  undoRentPaid,
  type Tenant,
  type BizDashboard,
  type BizItem,
  type BizPreset,
  type BizSupply,
  type Business,
  type FixedCost,
  type RecipeLine,
} from './api';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/Glass';
import { contentMaxWidth } from '../ui/responsive';
import { confirmDestructive } from '../ui/confirm';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';
const ACCENT = '#2563eb';
const GOOD = '#047857';
const WARN = '#b45309';
const BAD = '#b91c1c';

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}

function money(sym: string, n: number): string {
  const v = Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${sym}${v}`;
}

export function BusinessPane({ width, topInset }: { width: number; topInset: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro } = useIsPro();
  const colMax = contentMaxWidth(width);

  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dash, setDash] = useState<BizDashboard | null>(null);
  const [items, setItems] = useState<BizItem[]>([]);
  const [fixed, setFixed] = useState<FixedCost[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // sheets
  const [lossFor, setLossFor] = useState<BizItem | null>(null);
  const [showCost, setShowCost] = useState(false);
  const [showItemNew, setShowItemNew] = useState(false);
  const [editItem, setEditItem] = useState<BizItem | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showTenantNew, setShowTenantNew] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showNewBiz, setShowNewBiz] = useState(false);

  const biz = businesses.find((b) => b.id === selectedId) ?? businesses[0] ?? null;

  const load = useCallback(async () => {
    try {
      const list = await listBusinesses();
      setBusinesses(list);
      // keep the current selection if it still exists, else fall back to the first
      const active = list.find((b) => b.id === selectedId) ?? list[0] ?? null;
      setSelectedId(active?.id ?? null);
      if (active) {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        const [d, its, fx, tn] = await Promise.all([
          getDashboard(active.id, from, now),
          listItemsCosted(active.id),
          listFixedCosts(active.id),
          active.preset === 'rental' ? listTenants(active.id) : Promise.resolve([]),
        ]);
        setDash(d);
        setItems(its);
        setFixed(fx);
        setTenants(tn);
      } else {
        setDash(null);
        setItems([]);
        setFixed([]);
        setTenants([]);
      }
    } catch {
      showToast('Could not load your business right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedId]);

  useFocusEffect(
    useCallback(() => {
      if (isPro) load();
      else setLoading(false);
    }, [isPro, load]),
  );

  // switching businesses reloads that business's numbers
  const switchTo = useCallback((id: string) => {
    setSelectedId(id);
    setShowSwitcher(false);
    setLoading(true);
  }, []);
  useEffect(() => {
    if (isPro && selectedId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const onSell = useCallback(
    async (item: BizItem) => {
      if (!biz) return;
      try {
        const id = await recordSale(item, biz.id);
        const keep = (item.keep ?? 0).toFixed(0);
        showToast(`${item.name} sold — you keep ${money(biz.currency_symbol, Number(keep))}`);
        load();
        return id;
      } catch {
        showToast('Could not record that sale.');
      }
    },
    [biz, load],
  );

  if (!isPro) {
    return (
      <View style={[styles.screen, { width }]}>
        <View style={[styles.center, { paddingTop: topInset + 40 }]}>
          <GlassCard>
            <View style={styles.proGate}>
              <View style={styles.proIcon}>
                <Ionicons name="briefcase" size={26} color={ACCENT} />
              </View>
              <Text style={styles.proTitle}>Business Tracker</Text>
              <Text style={styles.proBody}>
                Know what one portion really costs, whether today covered your rent, and where
                profit is leaking. Built for owner-operators — food, store, services, rentals and
                more.
              </Text>
              <Pressable style={styles.proBtn} onPress={() => router.push('/paywall')}>
                <Text style={styles.proBtnTxt}>See Pro</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { width }]}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  if (!biz) {
    return <SetupWizard onDone={load} width={width} topInset={topInset} />;
  }

  if (showNewBiz) {
    return (
      <SetupWizard
        onDone={() => { setShowNewBiz(false); load(); }}
        onCancel={() => setShowNewBiz(false)}
        width={width}
        topInset={topInset}
      />
    );
  }

  const preset = PRESETS[biz.preset];
  const sym = biz.currency_symbol;
  const progress = dash?.today_progress ?? null;
  const pct = progress == null ? 0 : Math.min(1, Math.max(0, progress));
  const covered = progress != null && progress >= 1;

  return (
    <View style={[styles.screen, { width }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { maxWidth: colMax, paddingTop: topInset, paddingBottom: insets.bottom + 40 }]}
        style={{ alignSelf: 'center', width: '100%' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* header — tap to switch businesses or add another */}
        <Pressable
          style={styles.bizHeader}
          onPress={() => setShowSwitcher(true)}
          accessibilityLabel="Switch business"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.bizName} numberOfLines={1}>{biz.name}</Text>
            <Text style={styles.bizPresetLabel}>{preset.title}</Text>
          </View>
          <View style={styles.bizSwitchChip}>
            <Ionicons name="swap-horizontal" size={15} color={ACCENT} />
            <Text style={styles.bizSwitchTxt}>
              {businesses.length > 1 ? `${businesses.length} businesses` : 'Switch'}
            </Text>
          </View>
        </Pressable>
        {/* ── Today vs break-even: the only number above the fold ── */}
        <GlassCard>
          <View style={styles.card}>
            <Text style={styles.kicker}>TODAY</Text>
            {dash && dash.daily_target > 0 ? (
              <>
                <Text style={styles.bigLine}>
                  <Text style={[styles.bigNum, covered && { color: GOOD }]}>
                    {money(sym, dash.today_keep)}
                  </Text>
                  <Text style={styles.bigOf}>  of {money(sym, dash.daily_target)} to break even</Text>
                </Text>
                <View style={styles.track}>
                  <View
                    style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: covered ? GOOD : ACCENT }]}
                  />
                </View>
                <Text style={styles.foot}>
                  {covered
                    ? 'Covered — everything from here is yours.'
                    : `${money(sym, Math.max(0, dash.daily_target - dash.today_keep))} to go before today pays for itself.`}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.bigLine}>
                  <Text style={styles.bigNum}>{money(sym, dash?.today_keep ?? 0)}</Text>
                  <Text style={styles.bigOf}>  kept today</Text>
                </Text>
                <Pressable onPress={() => setShowFixed(true)}>
                  <Text style={styles.link}>Add your bills — rent, electricity, water — to see your daily break-even →</Text>
                </Pressable>
              </>
            )}
          </View>
        </GlassCard>

        {/* ── Renters (rental preset): who pays, when, and who is late ── */}
        {biz.preset === 'rental' ? (
          <GlassCard>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.kicker}>RENTERS</Text>
                <Pressable onPress={() => setShowTenantNew(true)} hitSlop={8}>
                  <Text style={styles.link}>+ Renter</Text>
                </Pressable>
              </View>
              {tenants.length === 0 ? (
                <Text style={styles.sheetSub}>
                  Add each renter once — name, unit, monthly rent, due day. Every month is then one
                  tap: paid. Late renters turn red so nothing slips.
                </Text>
              ) : (
                <>
                  <Text style={styles.rentRoll}>
                    Rent roll {money(sym, tenants.reduce((a, t) => a + t.monthly_rent, 0))}/mo · collected{' '}
                    {money(sym, tenants.filter((t) => t.paid_sale_id).reduce((a, t) => a + t.monthly_rent, 0))}
                    {tenants.some((t) => rentStatus(t).kind === 'overdue')
                      ? ` · ${tenants.filter((t) => rentStatus(t).kind === 'overdue').length} overdue`
                      : ''}
                  </Text>
                  {tenants.map((t) => {
                    const st = rentStatus(t);
                    return (
                      <Pressable
                        key={t.id}
                        style={styles.tenantRow}
                        onLongPress={() =>
                          confirmDestructive(
                            `${t.renter_name} moved out?`,
                            'The renter is removed from the board. Collected rent stays in your numbers.',
                            'Moved out',
                            () => { endTenant(t.id).catch(() => {}); load(); },
                          )
                        }
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.tenantName} numberOfLines={1}>{t.renter_name}</Text>
                          <Text style={styles.tenantSub} numberOfLines={1}>
                            {t.property} · {money(sym, t.monthly_rent)} · due {t.due_day}{ordinal(t.due_day)}
                          </Text>
                        </View>
                        {st.kind === 'paid' ? (
                          <Pressable
                            style={styles.rentPaid}
                            onPress={() =>
                              confirmDestructive(
                                'Undo this month’s rent?',
                                `${t.renter_name} goes back to unpaid and the amount leaves your totals.`,
                                'Undo',
                                () => { if (t.paid_sale_id) undoRentPaid(t.paid_sale_id).catch(() => {}); load(); },
                              )
                            }
                            accessibilityLabel={`Undo rent for ${t.renter_name}`}
                          >
                            <Ionicons name="checkmark" size={13} color={GOOD} />
                            <Text style={styles.rentPaidTxt}>Paid</Text>
                          </Pressable>
                        ) : (
                          <View style={styles.rentRight}>
                            <Text style={[styles.rentDue, st.kind === 'overdue' && { color: BAD }]}>
                              {st.kind === 'overdue'
                                ? `${st.days}d late`
                                : st.days === 0 ? 'due today' : `in ${st.days}d`}
                            </Text>
                            <Pressable
                              style={styles.rentBtn}
                              onPress={async () => {
                                try {
                                  await markRentPaid(t, biz.id);
                                  showToast(`${t.renter_name} paid ${money(sym, t.monthly_rent)} ✓`);
                                  load();
                                } catch {
                                  showToast('Could not record the rent.');
                                }
                              }}
                              accessibilityLabel={`Mark rent paid for ${t.renter_name}`}
                            >
                              <Text style={styles.rentBtnTxt}>Paid</Text>
                            </Pressable>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>
          </GlassCard>
        ) : null}

        {/* ── Tap-to-sell tiles ── */}
        <View style={styles.rowBetween}>
          <Text style={styles.section}>Tap when one {preset.unitLabel} leaves</Text>
          <Pressable onPress={() => setShowItemNew(true)} hitSlop={8}>
            <Text style={styles.link}>+ {preset.itemLabel}</Text>
          </Pressable>
        </View>
        {items.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon="pricetags"
              title={`Add your first ${preset.itemLabel.toLowerCase()}`}
              subtitle="Price it, cost it, and every tap after that records a sale with your real margin."
              actionTitle={`Add a ${preset.itemLabel.toLowerCase()}`}
              onAction={() => setShowItemNew(true)}
            />
          </GlassCard>
        ) : (
          <View style={styles.tiles}>
            {items.map((it) => {
              const below = (it.keep_pct ?? 0) < (it.target_margin_pct ?? 0);
              const losing = (it.keep ?? 0) < 0;
              return (
                <Pressable
                  key={it.id}
                  style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                  onPress={() => onSell(it)}
                  onLongPress={() => setEditItem(it)}
                  accessibilityLabel={`Sell one ${it.name}`}
                >
                  <Text style={styles.tileName} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.tilePrice}>{money(sym, it.price)}</Text>
                  <Text style={[styles.tileKeep, losing ? { color: BAD } : below ? { color: WARN } : { color: GOOD }]}>
                    keep {money(sym, it.keep ?? 0)}
                  </Text>
                  <Pressable
                    style={styles.lossBtn}
                    hitSlop={6}
                    onPress={() => setLossFor(it)}
                    accessibilityLabel={`Record a loss of ${it.name}`}
                  >
                    <Ionicons name="trending-down" size={13} color={BAD} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Quick actions ── */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => setShowCost(true)}>
            <Ionicons name="remove-circle-outline" size={16} color={INK} />
            <Text style={styles.actionTxt}>Money out</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => setShowFixed(true)}>
            <Ionicons name="calendar-outline" size={16} color={INK} />
            <Text style={styles.actionTxt}>Bills</Text>
          </Pressable>
        </View>

        {/* ── This month ── */}
        {dash ? (
          <GlassCard>
            <View style={styles.card}>
              <Text style={styles.kicker}>THIS MONTH</Text>
              <MonthRow label="Kept from sales" value={money(sym, dash.contribution)} />
              <MonthRow label="Money out" value={`−${money(sym, dash.costs)}`} />
              <MonthRow
                label="The leak (lost, spoiled, free)"
                value={`−${money(sym, dash.leak)}`}
                tint={dash.leak > 0 ? WARN : undefined}
                sub={dash.leak_share > 0.05 ? `That ate ${(dash.leak_share * 100).toFixed(0)}% of what you kept.` : undefined}
              />
              <MonthRow label="Bills so far (rent, power…)" value={`−${money(sym, dash.fixed_prorated)}`} />
              <View style={styles.hr} />
              <MonthRow
                label="The month so far"
                value={money(sym, dash.net)}
                tint={dash.net >= 0 ? GOOD : BAD}
                bold
              />
            </View>
          </GlassCard>
        ) : null}

        <Text style={styles.hint}>
          Long-press a tile to edit it. Tap the small red arrow when something leaves without being
          paid — spoiled, given away, returned. Recording losses is how you find your leak.
        </Text>
      </ScrollView>

      <LossSheet
        item={lossFor}
        sym={sym}
        onClose={() => setLossFor(null)}
        onSave={async (reason, qty) => {
          if (!biz || !lossFor) return;
          try {
            await recordLoss({ business_id: biz.id, item: lossFor, qty, reason });
            showToast('Loss recorded — it counts against today.');
            setLossFor(null);
            load();
          } catch {
            showToast('Could not record that loss.');
          }
        }}
      />
      <CostSheet
        visible={showCost}
        sym={sym}
        onClose={() => setShowCost(false)}
        onSave={async (amount, chip, note) => {
          if (!biz) return;
          try {
            await recordCost({ business_id: biz.id, amount, type: chip.type, category_key: chip.key, note });
            showToast('Recorded.');
            setShowCost(false);
            load();
          } catch {
            showToast('Could not record that.');
          }
        }}
      />
      <ItemSheet
        visible={showItemNew || !!editItem}
        biz={biz}
        item={editItem}
        onClose={() => { setShowItemNew(false); setEditItem(null); }}
        onSaved={() => { setShowItemNew(false); setEditItem(null); load(); }}
      />
      <TenantSheet
        visible={showTenantNew}
        biz={biz}
        onClose={() => setShowTenantNew(false)}
        onSaved={() => { setShowTenantNew(false); load(); }}
      />
      <FixedSheet
        visible={showFixed}
        biz={biz}
        fixed={fixed}
        onClose={() => setShowFixed(false)}
        onChanged={load}
      />
      <SwitcherSheet
        visible={showSwitcher}
        businesses={businesses}
        currentId={biz.id}
        onClose={() => setShowSwitcher(false)}
        onPick={switchTo}
        onNew={() => { setShowSwitcher(false); setShowNewBiz(true); }}
        onRemove={(b) =>
          confirmDestructive(
            `Remove ${b.name}?`,
            'This business and its items, sales and bills are hidden from your tracker. Your other businesses are untouched.',
            'Remove',
            async () => {
              try {
                await archiveBusiness(b.id);
                if (selectedId === b.id) setSelectedId(null);
                setShowSwitcher(false);
                load();
              } catch {
                showToast('Could not remove that business.');
              }
            },
          )
        }
      />
    </View>
  );
}

function SwitcherSheet({ visible, businesses, currentId, onClose, onPick, onNew, onRemove }: {
  visible: boolean;
  businesses: Business[];
  currentId: string;
  onClose: () => void;
  onPick: (id: string) => void;
  onNew: () => void;
  onRemove: (b: Business) => void;
}) {
  return (
    <SheetShell visible={visible} title="Your businesses" onClose={onClose}>
      <Text style={styles.sheetSub}>
        Run more than one? Keep them side by side — a food stall, a rental, whatever you've got.
      </Text>
      {businesses.map((b) => {
        const meta = PRESETS[b.preset];
        const on = b.id === currentId;
        return (
          <View key={b.id} style={[styles.switchRow, on && styles.switchRowOn]}>
            <Pressable style={styles.switchMain} onPress={() => onPick(b.id)} accessibilityLabel={`Switch to ${b.name}`}>
              <View style={[styles.presetIcon, on && { backgroundColor: ACCENT }]}>
                <Ionicons name={meta.icon as any} size={16} color={on ? '#fff' : INK_SOFT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.switchName, on && { color: ACCENT }]} numberOfLines={1}>{b.name}</Text>
                <Text style={styles.switchSub}>{meta.title}</Text>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={20} color={ACCENT} /> : null}
            </Pressable>
            {businesses.length > 1 ? (
              <Pressable hitSlop={8} onPress={() => onRemove(b)} accessibilityLabel={`Remove ${b.name}`}>
                <Ionicons name="trash-outline" size={17} color={INK_SOFT} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
      <Pressable style={styles.newBizBtn} onPress={onNew} accessibilityLabel="Add another business">
        <Ionicons name="add-circle" size={18} color={ACCENT} />
        <Text style={styles.newBizTxt}>Add another business</Text>
      </Pressable>
    </SheetShell>
  );
}

function MonthRow({ label, value, tint, sub, bold }: {
  label: string; value: string; tint?: string; sub?: string; bold?: boolean;
}) {
  return (
    <View style={styles.monthRow}>
      <View style={styles.rowBetween}>
        <Text style={[styles.monthLabel, bold && { fontFamily: font.bold, color: INK }]}>{label}</Text>
        <Text style={[styles.monthValue, bold && { fontFamily: font.bold }, tint ? { color: tint } : null]}>{value}</Text>
      </View>
      {sub ? <Text style={styles.monthSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Setup: name → what kind → done in under a minute ─────────────────────────

function SetupWizard({ onDone, onCancel, width, topInset }: {
  onDone: () => void; onCancel?: () => void; width: number; topInset: number;
}) {
  const insets = useSafeAreaInsets();
  const colMax = contentMaxWidth(width);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<BizPreset | null>(null);
  const [sym, setSym] = useState('');
  const [days, setDays] = useState('26');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !preset) {
      showToast('Give it a name and pick what kind of business it is.');
      return;
    }
    setSaving(true);
    try {
      await createBusiness({
        name: name.trim(),
        preset,
        currency_symbol: sym.trim(),
        days_open_per_month: Math.max(1, Math.min(31, Number(days) || 26)),
      });
      onDone();
    } catch {
      showToast('Could not create the business.');
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { width }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { maxWidth: colMax, paddingTop: topInset, paddingBottom: insets.bottom + 40 }]}
        style={{ alignSelf: 'center', width: '100%' }}
        keyboardShouldPersistTaps="handled"
      >
        <GlassCard>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.setupTitle}>
                {onCancel ? 'Add a business' : 'Set up your business'}
              </Text>
              {onCancel ? (
                <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Cancel">
                  <Ionicons name="close" size={22} color={INK_SOFT} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.setupBody}>
              Three questions, then you're tracking. You can change everything later.
            </Text>
            <Text style={styles.inputLabel}>Business name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ria's Bakeshop"
              placeholderTextColor="rgba(30,27,75,0.35)"
            />
            <Text style={styles.inputLabel}>What kind of business?</Text>
            {(Object.keys(PRESETS) as BizPreset[]).map((p) => {
              const meta = PRESETS[p];
              const on = preset === p;
              return (
                <Pressable
                  key={p}
                  style={[styles.presetRow, on && styles.presetOn]}
                  onPress={() => setPreset(p)}
                  accessibilityLabel={meta.title}
                >
                  <View style={[styles.presetIcon, on && { backgroundColor: ACCENT }]}>
                    <Ionicons name={meta.icon as any} size={16} color={on ? '#fff' : INK_SOFT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.presetTitle, on && { color: ACCENT }]}>{meta.title}</Text>
                    <Text style={styles.presetSub}>{meta.example}</Text>
                  </View>
                  {on ? <Ionicons name="checkmark-circle" size={20} color={ACCENT} /> : null}
                </Pressable>
              );
            })}
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Currency symbol</Text>
                <TextInput
                  style={styles.input}
                  value={sym}
                  onChangeText={setSym}
                  placeholder="₱  $  €  …"
                  placeholderTextColor="rgba(30,27,75,0.35)"
                  maxLength={4}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Days open / month</Text>
                <TextInput
                  style={styles.input}
                  value={days}
                  onChangeText={setDays}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>
            <Pressable style={[styles.proBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={styles.proBtnTxt}>{saving ? 'Creating…' : 'Start tracking'}</Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

// ── Sheets ───────────────────────────────────────────────────────────────────

function SheetShell({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={wide ? styles.sheetWideWrap : undefined}
        pointerEvents="box-none"
      >
        <View
          style={[
            wide ? styles.sheetWide : styles.sheet,
            !wide && { paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          {!wide ? <View style={styles.handle} /> : null}
          <View style={styles.rowBetween}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={INK_SOFT} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LossSheet({ item, sym, onClose, onSave }: {
  item: BizItem | null; sym: string; onClose: () => void;
  onSave: (reason: string, qty: number) => void;
}) {
  const [qty, setQty] = useState('1');
  useEffect(() => { if (item) setQty('1'); }, [item]);
  const q = Math.max(1, Number(qty) || 1);
  const value = item ? q * ((item.unit_cost ?? 0) + (item.extra_cost ?? 0)) : 0;
  return (
    <SheetShell visible={!!item} title={item ? `Lost: ${item.name}` : ''} onClose={onClose}>
      <Text style={styles.sheetSub}>
        It left the business with no cash attached. That's the leak — record it so it counts.
      </Text>
      <View style={styles.qtyRow}>
        <Pressable style={styles.qtyBtn} onPress={() => setQty(String(Math.max(1, q - 1)))}>
          <Ionicons name="remove" size={18} color={INK} />
        </Pressable>
        <TextInput style={styles.qtyInput} value={qty} onChangeText={setQty} keyboardType="number-pad" />
        <Pressable style={styles.qtyBtn} onPress={() => setQty(String(q + 1))}>
          <Ionicons name="add" size={18} color={INK} />
        </Pressable>
        <Text style={styles.qtyCost}>≈ {money(sym, value)} lost</Text>
      </View>
      <View style={styles.chips}>
        {LOSS_REASONS.map((r) => (
          <Pressable key={r.key} style={styles.chip} onPress={() => onSave(r.key, q)}>
            <Text style={styles.chipTxt}>{r.label}</Text>
          </Pressable>
        ))}
      </View>
    </SheetShell>
  );
}

function CostSheet({ visible, sym, onClose, onSave }: {
  visible: boolean; sym: string; onClose: () => void;
  onSave: (amount: number, chip: (typeof COST_CHIPS)[number], note?: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (visible) { setAmount(''); setNote(''); } }, [visible]);
  const a = Number(amount) || 0;
  return (
    <SheetShell visible={visible} title="Money out" onClose={onClose}>
      <Text style={styles.sheetSub}>Amount, one tap on what it was, done.</Text>
      <TextInput
        style={[styles.input, styles.amountInput]}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder={`${sym}0`}
        placeholderTextColor="rgba(30,27,75,0.35)"
        autoFocus
      />
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor="rgba(30,27,75,0.35)"
      />
      <View style={styles.chips}>
        {COST_CHIPS.map((c) => (
          <Pressable
            key={c.key}
            style={[styles.chip, a <= 0 && { opacity: 0.4 }]}
            disabled={a <= 0}
            onPress={() => onSave(a, c, note.trim() || undefined)}
          >
            <Text style={styles.chipTxt}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
    </SheetShell>
  );
}

/** Create/edit an item. For food-style costing the recipe builder lives here:
 *  supplies (pack price → unit cost, yields included) + lines per dish. */
function ItemSheet({ visible, biz, item, onClose, onSaved }: {
  visible: boolean; biz: Business | null; item: BizItem | null;
  onClose: () => void; onSaved: () => void;
}) {
  const isFood = biz?.preset === 'food';
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [yieldN, setYieldN] = useState('1');
  const [useRecipe, setUseRecipe] = useState(false);
  const [supplies, setSupplies] = useState<BizSupply[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // new supply mini-form
  const [supName, setSupName] = useState('');
  const [supPrice, setSupPrice] = useState('');
  const [supQty, setSupQty] = useState('');
  const [supUnit, setSupUnit] = useState('kg');
  // new line mini-form
  const [lineSupply, setLineSupply] = useState<BizSupply | null>(null);
  const [lineQty, setLineQty] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? '');
    setPrice(item ? String(item.price) : '');
    setCost(item ? String(item.direct_cost ?? '') : '');
    setYieldN(item ? String(item.recipe_yield || 1) : '1');
    setUseRecipe(item ? item.cost_source === 'recipe' : false);
    setSavedId(item?.id ?? null);
    setLines([]);
    setLineSupply(null);
    setLineQty('');
    if (biz && isFood) {
      listSupplies(biz.id).then(setSupplies).catch(() => {});
      if (item?.cost_source === 'recipe') listRecipe(item.id).then(setLines).catch(() => {});
    }
  }, [visible, item, biz, isFood]);

  if (!biz) return null;
  const meta = PRESETS[biz.preset];
  const sym = biz.currency_symbol;

  const saveBase = async (): Promise<string | null> => {
    if (!name.trim() || !(Number(price) > 0)) {
      showToast('Name and price are required.');
      return null;
    }
    setSaving(true);
    try {
      if (savedId) {
        const { updateItem } = await import('./api');
        await updateItem(savedId, {
          name: name.trim(),
          price: Number(price),
          direct_cost: Number(cost) || 0,
          recipe_yield: Math.max(1, Number(yieldN) || 1),
        });
        return savedId;
      }
      const id = await createItem({
        business_id: biz.id,
        name: name.trim(),
        unit_label: meta.unitLabel,
        price: Number(price),
        cost_source: useRecipe ? 'recipe' : 'manual',
        direct_cost: Number(cost) || 0,
        recipe_yield: Math.max(1, Number(yieldN) || 1),
      });
      setSavedId(id);
      return id;
    } catch {
      showToast('Could not save.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const addSupply = async () => {
    if (!supName.trim() || !(Number(supPrice) > 0) || !(Number(supQty) > 0)) {
      showToast('Supply needs a name, pack price and pack size.');
      return;
    }
    try {
      await createSupply({
        business_id: biz.id,
        name: supName.trim(),
        pack_price: Number(supPrice),
        pack_qty: Number(supQty),
        unit: supUnit,
      });
      setSupName(''); setSupPrice(''); setSupQty('');
      setSupplies(await listSupplies(biz.id));
      showToast('Supply saved — cost per unit is computed for you.');
    } catch {
      showToast('Could not save the supply.');
    }
  };

  const addLine = async () => {
    const id = savedId ?? (await saveBase());
    if (!id || !lineSupply || !(Number(lineQty) > 0)) {
      if (id) showToast('Pick an ingredient and how much goes in.');
      return;
    }
    try {
      await addRecipeLine({ item_id: id, supply_id: lineSupply.id, qty: Number(lineQty), unit: lineSupply.unit === 'kg' ? 'g' : lineSupply.unit === 'L' ? 'ml' : lineSupply.unit });
      setLines(await listRecipe(id));
      setLineSupply(null); setLineQty('');
    } catch {
      showToast('Could not add the ingredient.');
    }
  };

  const finish = async () => {
    const id = await saveBase();
    if (id) {
      showToast(savedId ? 'Saved.' : `${name.trim()} added — tap its tile to sell one.`);
      onSaved();
    }
  };

  return (
    <SheetShell
      visible={visible}
      title={item ? `Edit ${meta.itemLabel.toLowerCase()}` : `New ${meta.itemLabel.toLowerCase()}`}
      onClose={onClose}
    >
      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.inputLabel}>{meta.itemLabel} name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={isFood ? 'e.g. Pandesal' : 'Name'} placeholderTextColor="rgba(30,27,75,0.35)" />
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Selling price ({sym})</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(30,27,75,0.35)" />
          </View>
          {!useRecipe ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Cost per {meta.unitLabel} ({sym})</Text>
              <TextInput style={styles.input} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="Your honest estimate" placeholderTextColor="rgba(30,27,75,0.35)" />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Portions per recipe</Text>
              <TextInput style={styles.input} value={yieldN} onChangeText={setYieldN} keyboardType="number-pad" placeholder="1" placeholderTextColor="rgba(30,27,75,0.35)" />
            </View>
          )}
        </View>

        {isFood ? (
          <Pressable style={styles.recipeToggle} onPress={() => setUseRecipe(!useRecipe)}>
            <Ionicons name={useRecipe ? 'checkbox' : 'square-outline'} size={18} color={ACCENT} />
            <Text style={styles.recipeToggleTxt}>
              Cost it from a recipe — ingredient prices ÷ portions, computed for you
            </Text>
          </Pressable>
        ) : null}

        {isFood && useRecipe ? (
          <View style={styles.recipeBox}>
            <Text style={styles.recipeHead}>Ingredients in one recipe</Text>
            {lines.map((l) => {
              const s = supplies.find((x) => x.id === l.supply_id);
              return (
                <View key={l.id} style={styles.rowBetween}>
                  <Text style={styles.lineTxt}>{s?.name ?? 'Ingredient'} — {l.qty} {l.unit}</Text>
                  <Pressable hitSlop={8} onPress={async () => { await removeRecipeLine(l.id).catch(() => {}); if (savedId) setLines(await listRecipe(savedId)); }}>
                    <Ionicons name="close-circle" size={16} color={INK_SOFT} />
                  </Pressable>
                </View>
              );
            })}
            <View style={styles.lineAdd}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <View style={styles.chips}>
                  {supplies.map((s) => (
                    <Pressable
                      key={s.id}
                      style={[styles.chip, lineSupply?.id === s.id && styles.chipOn]}
                      onPress={() => setLineSupply(s)}
                    >
                      <Text style={[styles.chipTxt, lineSupply?.id === s.id && { color: '#fff' }]}>{s.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              {lineSupply ? (
                <View style={styles.twoCol}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={lineQty}
                    onChangeText={setLineQty}
                    keyboardType="decimal-pad"
                    placeholder={`How much ${lineSupply.name}? (${lineSupply.unit === 'kg' ? 'g' : lineSupply.unit === 'L' ? 'ml' : lineSupply.unit})`}
                    placeholderTextColor="rgba(30,27,75,0.35)"
                  />
                  <Pressable style={styles.smallBtn} onPress={addLine}>
                    <Text style={styles.smallBtnTxt}>Add</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View style={styles.hr} />
            <Text style={styles.recipeHead}>Your supplies (what the receipt says)</Text>
            <View style={styles.twoCol}>
              <TextInput style={[styles.input, { flex: 1.2 }]} value={supName} onChangeText={setSupName} placeholder="Flour" placeholderTextColor="rgba(30,27,75,0.35)" />
              <TextInput style={[styles.input, { flex: 1 }]} value={supPrice} onChangeText={setSupPrice} keyboardType="decimal-pad" placeholder={`${sym} pack`} placeholderTextColor="rgba(30,27,75,0.35)" />
              <TextInput style={[styles.input, { width: 76, flexGrow: 0 }]} value={supQty} onChangeText={setSupQty} keyboardType="decimal-pad" placeholder="50" placeholderTextColor="rgba(30,27,75,0.35)" />
              <Pressable style={styles.unitBtn} onPress={() => setSupUnit(supUnit === 'kg' ? 'L' : supUnit === 'L' ? 'pc' : 'kg')}>
                <Text style={styles.unitTxt}>{supUnit}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.smallBtn} onPress={addSupply}>
              <Text style={styles.smallBtnTxt}>Save supply</Text>
            </Pressable>
            <Text style={styles.recipeHint}>
              "{sym}2,400 for a 50 kg sack" is enough — the per-gram cost is computed for you.
            </Text>
          </View>
        ) : null}

        {item ? (
          <Pressable
            style={styles.archiveBtn}
            onPress={() =>
              confirmDestructive(
                `Remove ${item.name}?`,
                'Past sales keep their numbers. The tile goes away.',
                'Remove',
                () => { archiveItem(item.id).catch(() => {}); onSaved(); },
              )
            }
          >
            <Text style={styles.archiveTxt}>Remove this {meta.itemLabel.toLowerCase()}</Text>
          </Pressable>
        ) : null}

        <Pressable style={[styles.proBtn, saving && { opacity: 0.6 }]} onPress={finish} disabled={saving}>
          <Text style={styles.proBtnTxt}>{saving ? 'Saving…' : 'Done'}</Text>
        </Pressable>
      </ScrollView>
    </SheetShell>
  );
}

function TenantSheet({ visible, biz, onClose, onSaved }: {
  visible: boolean; biz: Business | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [property, setProperty] = useState('');
  const [rent, setRent] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (visible) { setName(''); setProperty(''); setRent(''); setDueDay('1'); setPhone(''); }
  }, [visible]);
  if (!biz) return null;
  return (
    <SheetShell visible={visible} title="New renter" onClose={onClose}>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Renter's name" placeholderTextColor="rgba(30,27,75,0.35)" />
      <TextInput style={styles.input} value={property} onChangeText={setProperty} placeholder="Unit / property (e.g. Unit 2A)" placeholderTextColor="rgba(30,27,75,0.35)" />
      <View style={styles.twoCol}>
        <TextInput style={[styles.input, { flex: 1 }]} value={rent} onChangeText={setRent} keyboardType="decimal-pad" placeholder={`${biz.currency_symbol} monthly rent`} placeholderTextColor="rgba(30,27,75,0.35)" />
        <TextInput style={[styles.input, { width: 96, flexGrow: 0 }]} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" maxLength={2} placeholder="Due day" placeholderTextColor="rgba(30,27,75,0.35)" />
      </View>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone (optional)" placeholderTextColor="rgba(30,27,75,0.35)" />
      <Text style={styles.recipeHint}>
        Tip: add the property's mortgage under Bills — it goes into your daily break-even.
      </Text>
      <Pressable
        style={[styles.proBtn, saving && { opacity: 0.6 }]}
        disabled={saving}
        onPress={async () => {
          if (!name.trim() || !property.trim() || !(Number(rent) > 0)) {
            showToast('Renter, unit and monthly rent are required.');
            return;
          }
          setSaving(true);
          try {
            await addTenant({
              business_id: biz.id,
              renter_name: name.trim(),
              property: property.trim(),
              monthly_rent: Number(rent),
              due_day: Math.min(31, Math.max(1, Number(dueDay) || 1)),
              phone: phone.trim() || undefined,
            });
            onSaved();
          } catch {
            showToast('Could not add the renter.');
            setSaving(false);
          }
        }}
      >
        <Text style={styles.proBtnTxt}>{saving ? 'Adding…' : 'Add renter'}</Text>
      </Pressable>
    </SheetShell>
  );
}

function FixedSheet({ visible, biz, fixed, onClose, onChanged }: {
  visible: boolean; biz: Business | null; fixed: FixedCost[];
  onClose: () => void; onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  useEffect(() => { if (visible) { setName(''); setAmount(''); setDueDay(''); } }, [visible]);
  if (!biz) return null;
  const sym = biz.currency_symbol;
  const total = fixed.reduce((a, f) => a + f.amount, 0);
  return (
    <SheetShell visible={visible} title="Business bills" onClose={onClose}>
      <Text style={styles.sheetSub}>
        Rent, electricity, water, employee pay — what the business owes every month whether you
        open or not. This is what sets your daily break-even.
      </Text>
      {fixed.map((f) => (
        <View key={f.id} style={styles.rowBetween}>
          <Text style={styles.lineTxt}>
            {f.name}
            {f.due_day ? <Text style={styles.dueTxt}>  · due {f.due_day}{ordinal(f.due_day)}</Text> : null}
          </Text>
          <View style={styles.rowEnd}>
            <Text style={styles.lineTxt}>{money(sym, f.amount)}</Text>
            <Pressable hitSlop={8} onPress={async () => { await endFixedCost(f.id).catch(() => {}); onChanged(); }}>
              <Ionicons name="close-circle" size={16} color={INK_SOFT} />
            </Pressable>
          </View>
        </View>
      ))}
      <View style={styles.chips}>
        {BILL_PRESETS.filter((b) => !fixed.some((f) => f.name === b)).map((b) => (
          <Pressable key={b} style={[styles.chip, name === b && styles.chipOn]} onPress={() => setName(b)}>
            <Text style={[styles.chipTxt, name === b && { color: '#fff' }]}>{b}</Text>
          </Pressable>
        ))}
      </View>
      {fixed.length ? (
        <Text style={styles.fixedTotal}>
          {money(sym, total)} / month ÷ {biz.days_open_per_month} days open ={' '}
          {money(sym, total / biz.days_open_per_month)} to break even daily
        </Text>
      ) : null}
      <View style={styles.twoCol}>
        <TextInput style={[styles.input, { flex: 1.4 }]} value={name} onChangeText={setName} placeholder="Bill name" placeholderTextColor="rgba(30,27,75,0.35)" />
        <TextInput style={[styles.input, { flex: 1 }]} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={`${sym} / month`} placeholderTextColor="rgba(30,27,75,0.35)" />
        <TextInput style={[styles.input, { width: 96, flexGrow: 0 }]} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" maxLength={2} placeholder="Due day" placeholderTextColor="rgba(30,27,75,0.35)" />
      </View>
      <Pressable
        style={styles.smallBtn}
        onPress={async () => {
          if (!name.trim() || !(Number(amount) > 0)) { showToast('Name and amount, please.'); return; }
          const day = Math.min(31, Math.max(1, Number(dueDay) || 0)) || null;
          await addFixedCost({ business_id: biz.id, name: name.trim(), amount: Number(amount), due_day: day }).catch(() => showToast('Could not add.'));
          setName(''); setAmount(''); setDueDay('');
          onChanged();
        }}
      >
        <Text style={styles.smallBtnTxt}>Add bill</Text>
      </Pressable>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bizHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  bizName: { fontFamily: font.extrabold, fontSize: 20, color: INK },
  bizPresetLabel: { fontFamily: font.medium, fontSize: 12.5, color: INK_SOFT, marginTop: 1 },
  bizSwitchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  bizSwitchTxt: { fontFamily: font.semibold, fontSize: 12.5, color: ACCENT },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(30,27,75,0.08)', backgroundColor: '#fff',
    borderRadius: radius.md, paddingRight: 12, marginTop: 6,
  },
  switchRowOn: { borderColor: ACCENT, backgroundColor: '#f4f7ff' },
  switchMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  switchName: { fontFamily: font.bold, fontSize: 14, color: INK },
  switchSub: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT },
  newBizBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderColor: ACCENT, borderRadius: radius.md,
    paddingVertical: 12, marginTop: 10,
  },
  newBizTxt: { fontFamily: font.bold, fontSize: 14, color: ACCENT },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.md, width: '100%' },
  card: { padding: spacing.lg, gap: 8 },
  kicker: { fontFamily: font.extrabold, fontSize: 11, letterSpacing: 1.5, color: ACCENT },
  bigLine: { flexDirection: 'row', alignItems: 'baseline' } as any,
  bigNum: { fontFamily: font.extrabold, fontSize: 28, color: INK },
  bigOf: { fontFamily: font.medium, fontSize: 13, color: INK_SOFT },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(30,27,75,0.1)', overflow: 'hidden', marginTop: 6 },
  fill: { height: 10, borderRadius: 5 },
  foot: { fontFamily: font.medium, fontSize: 12.5, color: INK_SOFT, marginTop: 2 },
  link: { fontFamily: font.semibold, fontSize: 13, color: ACCENT },
  section: { fontFamily: font.bold, fontSize: 15, color: INK, marginTop: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31%',
    minWidth: 104,
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,27,75,0.1)',
  },
  tilePressed: { transform: [{ scale: 0.97 }], backgroundColor: '#f4f7ff' },
  tileName: { fontFamily: font.bold, fontSize: 14, color: INK },
  tilePrice: { fontFamily: font.semibold, fontSize: 13, color: INK_SOFT },
  tileKeep: { fontFamily: font.semibold, fontSize: 12 },
  lossBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(185,28,28,0.08)',
  },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,27,75,0.1)',
  },
  actionTxt: { fontFamily: font.semibold, fontSize: 13.5, color: INK },
  monthRow: { gap: 2, paddingVertical: 3 },
  monthLabel: { fontFamily: font.medium, fontSize: 13.5, color: INK_SOFT },
  monthValue: { fontFamily: font.semibold, fontSize: 14, color: INK },
  monthSub: { fontFamily: font.medium, fontSize: 12, color: WARN },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(30,27,75,0.12)', marginVertical: 6 },
  hint: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, lineHeight: 17, paddingHorizontal: 4 },
  // pro gate
  proGate: { padding: spacing.xl, alignItems: 'center', gap: 10 },
  proIcon: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.1)',
  },
  proTitle: { fontFamily: font.extrabold, fontSize: 20, color: INK },
  proBody: { fontFamily: font.medium, fontSize: 13.5, color: INK_SOFT, textAlign: 'center', lineHeight: 19 },
  proBtn: {
    backgroundColor: ACCENT, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 28,
    alignItems: 'center', marginTop: 6, alignSelf: 'stretch',
  },
  proBtnTxt: { fontFamily: font.bold, fontSize: 15, color: '#fff' },
  // setup
  setupTitle: { fontFamily: font.extrabold, fontSize: 20, color: INK },
  setupBody: { fontFamily: font.medium, fontSize: 13.5, color: INK_SOFT, lineHeight: 19 },
  inputLabel: { fontFamily: font.semibold, fontSize: 12.5, color: INK_SOFT, marginTop: 8 },
  input: {
    backgroundColor: '#fff', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,27,75,0.15)', paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: font.medium, fontSize: 14.5, color: INK, marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(30,27,75,0.08)', backgroundColor: '#fff', marginTop: 6,
  },
  presetOn: { borderColor: ACCENT, backgroundColor: '#f4f7ff' },
  presetIcon: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,75,0.06)',
  },
  presetTitle: { fontFamily: font.bold, fontSize: 14, color: INK },
  presetSub: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'flex-end' },
  // sheets
  dim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surfaceAlt, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, gap: 8,
  },
  sheetWideWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheetWide: {
    width: 520, maxWidth: '92%', backgroundColor: colors.surfaceAlt, borderRadius: 22,
    padding: spacing.lg, gap: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(30,27,75,0.18)', marginBottom: 4 },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 17, color: INK },
  sheetSub: { fontFamily: font.medium, fontSize: 13, color: INK_SOFT, lineHeight: 18 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  qtyBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(30,27,75,0.15)',
  },
  qtyInput: {
    width: 56, textAlign: 'center', backgroundColor: '#fff', borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(30,27,75,0.15)',
    paddingVertical: 8, fontFamily: font.bold, fontSize: 16, color: INK,
  },
  qtyCost: { fontFamily: font.semibold, fontSize: 13, color: BAD },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(30,27,75,0.15)',
  },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipTxt: { fontFamily: font.semibold, fontSize: 13, color: INK },
  amountInput: { fontFamily: font.extrabold, fontSize: 22 },
  recipeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  recipeToggleTxt: { flex: 1, fontFamily: font.medium, fontSize: 13, color: INK, lineHeight: 18 },
  recipeBox: {
    marginTop: 10, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: 'rgba(37,99,235,0.05)', gap: 6,
  },
  recipeHead: { fontFamily: font.bold, fontSize: 13, color: INK },
  recipeHint: { fontFamily: font.medium, fontSize: 11.5, color: INK_SOFT, lineHeight: 16 },
  lineTxt: { fontFamily: font.medium, fontSize: 13, color: INK },
  dueTxt: { fontFamily: font.medium, fontSize: 11.5, color: INK_SOFT },
  lineAdd: { gap: 6 },
  smallBtn: {
    alignSelf: 'flex-start', backgroundColor: ACCENT, borderRadius: radius.md,
    paddingHorizontal: 16, paddingVertical: 9, marginTop: 4,
  },
  smallBtnTxt: { fontFamily: font.bold, fontSize: 13, color: '#fff' },
  unitBtn: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(30,27,75,0.15)', marginTop: 4,
  },
  unitTxt: { fontFamily: font.bold, fontSize: 13, color: ACCENT },
  rentRoll: { fontFamily: font.semibold, fontSize: 12.5, color: INK_SOFT },
  tenantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(30,27,75,0.08)',
  },
  tenantName: { fontFamily: font.bold, fontSize: 14, color: INK },
  tenantSub: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, marginTop: 1 },
  rentRight: { alignItems: 'flex-end', gap: 3 },
  rentDue: { fontFamily: font.semibold, fontSize: 11.5, color: WARN },
  rentBtn: { backgroundColor: ACCENT, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  rentBtnTxt: { fontFamily: font.bold, fontSize: 12, color: '#fff' },
  rentPaid: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(4,120,87,0.1)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  rentPaidTxt: { fontFamily: font.semibold, fontSize: 11.5, color: GOOD },
  fixedTotal: { fontFamily: font.semibold, fontSize: 12.5, color: GOOD, marginTop: 4, lineHeight: 17 },
  archiveBtn: { marginTop: 12, alignSelf: 'center' },
  archiveTxt: { fontFamily: font.semibold, fontSize: 13, color: BAD },
});
