import React, { useState, useEffect, useMemo } from "react";
import {
  Smartphone, Search, Plus, Minus, X, Settings, Package,
  ClipboardList, Trash2, Pencil, Check, PhoneCall, Loader2
} from "lucide-react";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  setDoc, getDocs, query, orderBy, runTransaction, serverTimestamp
} from "firebase/firestore";

/* ---------------- design tokens ---------------- */
const COLORS = {
  bg: "#0E1013",
  surface: "#171A1F",
  surface2: "#1F232A",
  line: "#2A2F37",
  accent: "#00C2A8",
  accentDim: "#0A3B35",
  amber: "#F2A93B",
  danger: "#E5484D",
  text: "#EDEEF0",
  muted: "#8B93A1",
};

const DEFAULT_PRODUCTS = [
  { name: "iPhone 13 - 128GB", category: "هواتف", price: 78000, stock: 4, desc: "حالة ممتازة، بطارية 91%" },
  { name: "Samsung A54", category: "هواتف", price: 42000, stock: 0, desc: "جديد، ضمان سنة" },
  { name: "شاحن سريع 25W", category: "اكسسوارات", price: 2500, stock: 12, desc: "أصلي Samsung" },
  { name: "شاشة iPhone 12", category: "قطع غيار", price: 9000, stock: 2, desc: "OLED أصلية" },
  { name: "سماعات لاسلكية", category: "اكسسوارات", price: 3200, stock: 7, desc: "بلوتوث 5.3" },
];

const DEFAULT_SETTINGS = {
  shopName: "Bitam Telecom",
  deliveryPhone: "0550000000",
  pin: "1234",
  hideOutOfStock: true,
};

function formatDZD(n) {
  return new Intl.NumberFormat("fr-DZ").format(n);
}

/* ---------------- small UI atoms ---------------- */
function StockBar({ stock }) {
  const level = stock === 0 ? 0 : stock <= 3 ? 1 : stock <= 8 ? 2 : 3;
  const color = level === 0 ? COLORS.danger : level === 1 ? COLORS.amber : COLORS.accent;
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 10, height: 4 + i * 3, borderRadius: 2, background: i < level || level === 3 ? color : COLORS.line }} />
      ))}
    </div>
  );
}

function PriceTag({ price }) {
  return (
    <div className="relative inline-flex items-center">
      <div className="f-mono flex items-center gap-1 px-2 py-1" style={{ background: COLORS.accentDim, color: COLORS.accent, borderRadius: 6, border: `1px dashed ${COLORS.accent}55`, fontSize: 13, fontWeight: 600 }}>
        {formatDZD(price)} <span style={{ opacity: 0.7, fontSize: 11 }}>د.ج</span>
      </div>
    </div>
  );
}

/* ---------------- main app ---------------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState("shop");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [orderTarget, setOrderTarget] = useState(null);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [orderStep, setOrderStep] = useState("form");
  const [lastOrder, setLastOrder] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [adminTab, setAdminTab] = useState("products");
  const [editingProduct, setEditingProduct] = useState(null);
  const [orderError, setOrderError] = useState("");

  // seed + subscribe
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "products"));
      if (snap.empty) {
        for (const p of DEFAULT_PRODUCTS) {
          await addDoc(collection(db, "products"), p);
        }
      }
      const settingsSnap = await getDocs(collection(db, "settings"));
      if (settingsSnap.empty) {
        await setDoc(doc(db, "settings", "shop"), DEFAULT_SETTINGS);
      }
      setLoading(false);
    })();

    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "shop"), (snap) => {
      if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...snap.data() });
    });
    const unsubOrders = onSnapshot(
      query(collection(db, "orders"), orderBy("time", "desc")),
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubProducts(); unsubSettings(); unsubOrders(); };
  }, []);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["الكل", ...Array.from(set)];
  }, [products]);

  const visibleProducts = useMemo(() => {
    return products
      .filter((p) => (settings.hideOutOfStock ? p.stock > 0 : true))
      .filter((p) => (category === "الكل" ? true : p.category === category))
      .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [products, category, search, settings.hideOutOfStock]);

  /* ---- ordering flow (atomic stock decrement via transaction) ---- */
  const openOrder = (product) => {
    setOrderTarget({ ...product, qty: 1 });
    setOrderStep("form");
    setOrderError("");
  };

  const submitOrder = async () => {
    if (!customer.name.trim() || !customer.phone.trim() || !orderTarget) return;
    setOrderError("");
    try {
      const productRef = doc(db, "products", orderTarget.id);
      const orderData = await runTransaction(db, async (tx) => {
        const freshDoc = await tx.get(productRef);
        if (!freshDoc.exists()) throw new Error("هذا المنتج لم يعد متوفراً");
        const freshStock = freshDoc.data().stock;
        const qty = Math.min(orderTarget.qty, freshStock);
        if (qty <= 0) throw new Error("نفذت الكمية للتو، جرب منتجاً آخر");
        tx.update(productRef, { stock: freshStock - qty });
        return {
          productId: orderTarget.id,
          productName: orderTarget.name,
          price: orderTarget.price,
          qty,
          total: orderTarget.price * qty,
          customerName: customer.name.trim(),
          customerPhone: customer.phone.trim(),
          status: "جديد",
          time: new Date().toISOString(),
        };
      });
      const docRef = await addDoc(collection(db, "orders"), orderData);
      setLastOrder({ id: docRef.id, ...orderData });
      setOrderStep("done");
    } catch (err) {
      setOrderError(err.message || "تعذر إتمام الطلب، حاول مجدداً");
    }
  };

  /* ---- admin ---- */
  const tryPin = () => {
    if (pinInput === settings.pin) {
      setAdminAuthed(true);
      setPinPrompt(false);
      setPinInput("");
      setPinError(false);
      setView("admin");
    } else {
      setPinError(true);
    }
  };

  const saveProduct = async (draft) => {
    const data = {
      name: draft.name,
      category: draft.category || "عام",
      price: Number(draft.price),
      stock: Number(draft.stock),
      desc: draft.desc || "",
    };
    if (draft.id) {
      await updateDoc(doc(db, "products", draft.id), data);
    } else {
      await addDoc(collection(db, "products"), data);
    }
    setEditingProduct(null);
  };

  const deleteProduct = async (id) => {
    await deleteDoc(doc(db, "products", id));
  };

  const bumpStock = async (id, delta) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    await updateDoc(doc(db, "products", id), { stock: Math.max(0, p.stock + delta) });
  };

  const markOrderStatus = async (id, status) => {
    await updateDoc(doc(db, "orders", id), { status });
  };

  const saveSettings = async (next) => {
    await setDoc(doc(db, "settings", "shop"), next, { merge: true });
  };

  if (loading) {
    return (
      <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }} className="flex items-center justify-center">
        <Loader2 className="animate-spin" size={28} style={{ color: COLORS.accent }} />
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
      <header className="sticky top-0 z-20 px-4 pt-4 pb-3" style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.line}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 9, background: COLORS.accentDim }}>
              <Smartphone size={18} style={{ color: COLORS.accent }} />
            </div>
            <div>
              <div className="f-display" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{settings.shopName}</div>
              <div className="f-mono" style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>هواتف · قطع غيار · اكسسوارات</div>
            </div>
          </div>
          <button
            onClick={() => (adminAuthed ? setView(view === "admin" ? "shop" : "admin") : setPinPrompt(true))}
            className="flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 9, background: COLORS.surface2, border: `1px solid ${COLORS.line}` }}
          >
            <Settings size={16} style={{ color: COLORS.muted }} />
          </button>
        </div>
      </header>

      {view === "shop" && (
        <main className="px-4 pb-24 pt-3">
          <div className="flex items-center gap-2 px-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, height: 42 }}>
            <Search size={16} style={{ color: COLORS.muted }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن هاتف أو قطعة..." style={{ background: "transparent", outline: "none", color: COLORS.text, width: "100%", fontSize: 14 }} />
          </div>

          <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className="whitespace-nowrap px-3 py-1.5" style={{ borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: `1px solid ${c === category ? COLORS.accent : COLORS.line}`, background: c === category ? COLORS.accentDim : "transparent", color: c === category ? COLORS.accent : COLORS.muted }}>
                {c}
              </button>
            ))}
          </div>

          {visibleProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center" style={{ marginTop: 60, color: COLORS.muted }}>
              <Package size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
              <div style={{ fontSize: 13.5 }}>لا توجد نتائج مطابقة الآن</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mt-4">
              {visibleProducts.map((p) => {
                const out = p.stock === 0;
                return (
                  <div key={p.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 14 }} className="p-3 flex flex-col">
                    <div className="flex items-start justify-between">
                      <span className="f-mono" style={{ fontSize: 9.5, color: COLORS.muted, background: COLORS.surface2, padding: "2px 6px", borderRadius: 5 }}>{p.category}</span>
                      <StockBar stock={p.stock} />
                    </div>
                    <div className="f-display mt-2" style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, minHeight: 34 }}>{p.name}</div>
                    {p.desc && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2, minHeight: 28 }}>{p.desc}</div>}
                    <div className="mt-2"><PriceTag price={p.price} /></div>
                    <button disabled={out} onClick={() => openOrder(p)} className="mt-3 flex items-center justify-center gap-1.5 py-2" style={{ borderRadius: 9, fontSize: 13, fontWeight: 700, background: out ? "transparent" : COLORS.accent, color: out ? COLORS.danger : "#04140F", border: out ? `1px solid ${COLORS.danger}55` : "none", opacity: out ? 0.8 : 1 }}>
                      {out ? "نفذت الكمية" : "اطلب الآن"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {view === "admin" && adminAuthed && (
        <AdminPanel
          products={products}
          orders={orders}
          settings={settings}
          onSaveProduct={saveProduct}
          onDeleteProduct={deleteProduct}
          onBumpStock={bumpStock}
          onSaveSettings={saveSettings}
          onMarkOrder={markOrderStatus}
          tab={adminTab}
          setTab={setAdminTab}
          editingProduct={editingProduct}
          setEditingProduct={setEditingProduct}
        />
      )}

      {pinPrompt && (
        <Modal onClose={() => { setPinPrompt(false); setPinInput(""); setPinError(false); }}>
          <div className="f-display" style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>دخول المشرف</div>
          <input type="password" value={pinInput} onChange={(e) => { setPinInput(e.target.value); setPinError(false); }} placeholder="أدخل الرمز السري" className="f-mono" style={{ width: "100%", background: COLORS.surface2, border: `1px solid ${pinError ? COLORS.danger : COLORS.line}`, borderRadius: 9, padding: "10px 12px", color: COLORS.text, fontSize: 14, outline: "none" }} />
          {pinError && <div style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>رمز غير صحيح</div>}
          <button onClick={tryPin} className="mt-3 w-full py-2.5" style={{ background: COLORS.accent, color: "#04140F", borderRadius: 9, fontWeight: 700, fontSize: 14 }}>دخول</button>
        </Modal>
      )}

      {orderTarget && (
        <Modal onClose={() => setOrderTarget(null)}>
          {orderStep === "form" && (
            <>
              <div className="f-display" style={{ fontSize: 16, fontWeight: 800 }}>{orderTarget.name}</div>
              <div className="mt-1"><PriceTag price={orderTarget.price} /></div>
              <div className="flex items-center justify-between mt-4" style={{ background: COLORS.surface2, borderRadius: 10, padding: "8px 10px" }}>
                <span style={{ fontSize: 13, color: COLORS.muted }}>الكمية</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setOrderTarget((t) => ({ ...t, qty: Math.max(1, t.qty - 1) }))} style={{ color: COLORS.accent }}><Minus size={16} /></button>
                  <span className="f-mono" style={{ fontSize: 14, minWidth: 16, textAlign: "center" }}>{orderTarget.qty}</span>
                  <button onClick={() => setOrderTarget((t) => ({ ...t, qty: Math.min(t.stock, t.qty + 1) }))} style={{ color: COLORS.accent }}><Plus size={16} /></button>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2.5">
                <input value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="الاسم الكامل" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.line}`, borderRadius: 9, padding: "10px 12px", color: COLORS.text, fontSize: 14, outline: "none" }} />
                <input value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} placeholder="رقم الهاتف" type="tel" dir="ltr" className="f-mono" style={{ background: COLORS.surface2, border: `1px solid ${COLORS.line}`, borderRadius: 9, padding: "10px 12px", color: COLORS.text, fontSize: 14, outline: "none" }} />
              </div>
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 13, color: COLORS.muted }}>المجموع</span>
                <span className="f-mono" style={{ fontSize: 16, fontWeight: 600, color: COLORS.accent }}>{formatDZD(orderTarget.price * orderTarget.qty)} د.ج</span>
              </div>
              {orderError && <div style={{ color: COLORS.danger, fontSize: 12, marginTop: 8 }}>{orderError}</div>}
              <button onClick={submitOrder} disabled={!customer.name.trim() || !customer.phone.trim()} className="mt-4 w-full py-2.5 flex items-center justify-center gap-2" style={{ background: COLORS.accent, color: "#04140F", borderRadius: 9, fontWeight: 700, fontSize: 14, opacity: !customer.name.trim() || !customer.phone.trim() ? 0.5 : 1 }}>
                تأكيد الطلب
              </button>
            </>
          )}
          {orderStep === "done" && lastOrder && (
            <div className="text-center py-2">
              <div className="mx-auto flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: 999, background: COLORS.accentDim, marginBottom: 12 }}>
                <Check size={22} style={{ color: COLORS.accent }} />
              </div>
              <div className="f-display" style={{ fontSize: 16, fontWeight: 800 }}>تم تسجيل طلبك</div>
              <div className="f-mono" style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>رقم الطلب: {lastOrder.id.slice(-6)}</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 10, lineHeight: 1.6 }}>اضغط على الزر بالأسفل للاتصال المباشر بالتوصيل وتأكيد العنوان</div>
              <a href={`tel:${settings.deliveryPhone}`} className="mt-4 flex items-center justify-center gap-2 py-2.5" style={{ background: COLORS.accent, color: "#04140F", borderRadius: 9, fontWeight: 700, fontSize: 14 }}>
                <PhoneCall size={16} /> اتصل بالتوصيل الآن
              </a>
              <button onClick={() => { setOrderTarget(null); setOrderStep("form"); }} className="mt-2.5 w-full py-2.5" style={{ background: "transparent", color: COLORS.muted, borderRadius: 9, fontSize: 13, border: `1px solid ${COLORS.line}` }}>إغلاق</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "#000000aa" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-sm p-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: "18px 18px 0 0", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex justify-end mb-1"><button onClick={onClose} style={{ color: COLORS.muted }}><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function AdminPanel({ products, orders, settings, onSaveProduct, onDeleteProduct, onBumpStock, onSaveSettings, onMarkOrder, tab, setTab, editingProduct, setEditingProduct }) {
  const [localSettings, setLocalSettings] = useState(settings);
  useEffect(() => setLocalSettings(settings), [settings]);

  const emptyDraft = { name: "", category: "", price: "", stock: "", desc: "" };
  const [draft, setDraft] = useState(emptyDraft);
  useEffect(() => setDraft(editingProduct ? { ...editingProduct } : emptyDraft), [editingProduct]);

  return (
    <main className="px-4 pb-24 pt-3">
      <div className="flex gap-2 mb-4">
        {[
          { k: "products", label: "المنتجات", icon: Package },
          { k: "orders", label: `الطلبات (${orders.length})`, icon: ClipboardList },
          { k: "settings", label: "الإعدادات", icon: Settings },
        ].map(({ k, label, icon: Icon }) => (
          <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 px-3 py-2" style={{ borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: tab === k ? COLORS.accentDim : COLORS.surface, color: tab === k ? COLORS.accent : COLORS.muted, border: `1px solid ${tab === k ? COLORS.accent : COLORS.line}` }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "products" && (
        <div className="flex flex-col gap-2.5">
          <button onClick={() => setEditingProduct({})} className="flex items-center justify-center gap-1.5 py-2.5" style={{ borderRadius: 9, border: `1px dashed ${COLORS.accent}`, color: COLORS.accent, fontSize: 13, fontWeight: 600 }}>
            <Plus size={15} /> إضافة منتج جديد
          </button>

          {editingProduct !== null && (
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12 }} className="p-3 flex flex-col gap-2">
              <input placeholder="اسم المنتج" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
              <div className="flex gap-2">
                <input placeholder="الفئة" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                <input placeholder="السعر" type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} style={{ ...inputStyle, flex: 1 }} className="f-mono" />
              </div>
              <input placeholder="الكمية المتوفرة" type="number" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} style={inputStyle} className="f-mono" />
              <input placeholder="وصف مختصر (اختياري)" value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} style={inputStyle} />
              <div className="flex gap-2 mt-1">
                <button onClick={() => { if (!draft.name.trim() || draft.price === "" || draft.stock === "") return; onSaveProduct(draft); }} style={{ flex: 1, background: COLORS.accent, color: "#04140F", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13 }}>حفظ</button>
                <button onClick={() => setEditingProduct(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${COLORS.line}`, color: COLORS.muted, borderRadius: 8, padding: "9px 0", fontSize: 13 }}>إلغاء</button>
              </div>
            </div>
          )}

          {products.map((p) => (
            <div key={p.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12 }} className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="f-display" style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{p.category}</div>
                </div>
                <PriceTag price={p.price} />
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2" style={{ background: COLORS.surface2, borderRadius: 8, padding: "4px 8px" }}>
                  <button onClick={() => onBumpStock(p.id, -1)} style={{ color: COLORS.danger }}><Minus size={14} /></button>
                  <span className="f-mono" style={{ fontSize: 13, minWidth: 20, textAlign: "center", color: p.stock === 0 ? COLORS.danger : COLORS.text }}>{p.stock}</span>
                  <button onClick={() => onBumpStock(p.id, 1)} style={{ color: COLORS.accent }}><Plus size={14} /></button>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingProduct(p)} style={{ color: COLORS.muted }}><Pencil size={15} /></button>
                  <button onClick={() => onDeleteProduct(p.id)} style={{ color: COLORS.danger }}><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <div className="flex flex-col gap-2.5">
          {orders.length === 0 && <div style={{ color: COLORS.muted, fontSize: 13, textAlign: "center", marginTop: 30 }}>لا توجد طلبات بعد</div>}
          {orders.map((o) => (
            <div key={o.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12 }} className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="f-display" style={{ fontSize: 13.5, fontWeight: 700 }}>{o.productName} × {o.qty}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>{o.customerName} · <span className="f-mono" dir="ltr">{o.customerPhone}</span></div>
                </div>
                <span className="f-mono" style={{ fontSize: 13, color: COLORS.accent }}>{formatDZD(o.total)} د.ج</span>
              </div>
              <div className="flex items-center justify-between mt-2.5 pt-2.5" style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <span className="f-mono" style={{ fontSize: 10, color: COLORS.muted }}>{new Date(o.time).toLocaleString("fr-DZ")}</span>
                <select value={o.status} onChange={(e) => onMarkOrder(o.id, e.target.value)} style={{ background: COLORS.surface2, color: COLORS.text, border: `1px solid ${COLORS.line}`, borderRadius: 7, fontSize: 11.5, padding: "3px 6px" }}>
                  <option value="جديد">جديد</option>
                  <option value="قيد التوصيل">قيد التوصيل</option>
                  <option value="تم التسليم">تم التسليم</option>
                  <option value="ملغى">ملغى</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <div className="flex flex-col gap-3">
          <div>
            <label style={labelStyle}>اسم المحل</label>
            <input value={localSettings.shopName} onChange={(e) => setLocalSettings({ ...localSettings, shopName: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>رقم هاتف التوصيل</label>
            <input value={localSettings.deliveryPhone} dir="ltr" className="f-mono" onChange={(e) => setLocalSettings({ ...localSettings, deliveryPhone: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>الرمز السري للوحة التحكم</label>
            <input value={localSettings.pin} className="f-mono" onChange={(e) => setLocalSettings({ ...localSettings, pin: e.target.value })} style={inputStyle} />
          </div>
          <div className="flex items-center justify-between" style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 12px" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>إخفاء المنتج عند نفاذ الكمية</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>وإلا يظهر بعلامة "نفذت الكمية"</div>
            </div>
            <button onClick={() => setLocalSettings({ ...localSettings, hideOutOfStock: !localSettings.hideOutOfStock })} style={{ width: 42, height: 24, borderRadius: 999, position: "relative", background: localSettings.hideOutOfStock ? COLORS.accent : COLORS.line }}>
              <div style={{ position: "absolute", top: 3, [localSettings.hideOutOfStock ? "right" : "left"]: 3, width: 18, height: 18, borderRadius: 999, background: "#0E1013" }} />
            </button>
          </div>
          <button onClick={() => onSaveSettings(localSettings)} style={{ background: COLORS.accent, color: "#04140F", borderRadius: 9, padding: "10px 0", fontWeight: 700, fontSize: 14 }}>حفظ الإعدادات</button>
        </div>
      )}
    </main>
  );
}

const inputStyle = { background: COLORS.surface2, border: `1px solid ${COLORS.line}`, borderRadius: 9, padding: "10px 12px", color: COLORS.text, fontSize: 13.5, outline: "none", width: "100%" };
const labelStyle = { fontSize: 11.5, color: COLORS.muted, marginBottom: 5, display: "block" };
