(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const panel = $("campus-institutional-invoice-center");
  if (!panel) return;

  const list = $("campus-institutional-invoice-list");
  const message = $("campus-institutional-payment-message");
  const receiptView = $("campus-institutional-receipt-view");
  const refreshButton = $("campus-institutional-invoice-refresh");
  const referenceInput = $("campus-institutional-payment-reference");
  const reconcileButton = $("campus-institutional-payment-reconcile");
  const backend = () => window.CampusShieldBackend;
  let loading = false;
  let authorized = false;
  let lastInvoices = [];
  let callbackReference = (() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("institutional_invoice_payment") !== "1") return "";
    return String(params.get("reference") || params.get("trxref") || "").trim();
  })();

  function setMessage(text, state) {
    if (!message) return;
    message.textContent = text || "";
    message.dataset.state = state || "info";
  }

  async function invoke(body) {
    const client = backend()?.client;
    if (!client) throw new Error("The secure CampusShield connection is unavailable. Sign in again.");
    const { data, error } = await client.functions.invoke("campus-institutional-payment-admin", { body });
    if (error) {
      let detail = "";
      try {
        const response = error.context;
        if (response && typeof response.clone === "function") {
          const payload = await response.clone().json();
          if (typeof payload?.error === "string") detail = payload.error;
        }
      } catch (_) {}
      throw new Error(detail || error.message || "The university finance request could not be completed.");
    }
    if (data?.error) throw new Error(String(data.error));
    return data || {};
  }

  function formatMoney(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return "Amount unavailable";
    try {
      return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: currency || "NGN",
        maximumFractionDigits: 2,
      }).format(value / 100);
    } catch (_) {
      return "₦" + (value / 100).toLocaleString("en-NG");
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })
      : "—";
  }

  function textCell(row, value, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value == null || value === "" ? "—" : String(value);
    row.appendChild(cell);
    return cell;
  }

  function actionButton(label, action, invoiceId, secondary) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = secondary ? "btn secondary" : "btn";
    button.textContent = label;
    button.dataset.invoiceAction = action;
    button.dataset.invoiceId = invoiceId;
    return button;
  }

  function renderInvoices(invoices) {
    lastInvoices = Array.isArray(invoices) ? invoices : [];
    list.replaceChildren();
    if (!lastInvoices.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No CampusShield institutional invoices have been issued to this university yet.";
      list.appendChild(empty);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "campus-invoice-table-wrap";
    const table = document.createElement("table");
    table.className = "campus-invoice-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Invoice", "Plan", "Due date", "Total", "Status", "Action"].forEach((label) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    const tbody = document.createElement("tbody");

    lastInvoices.forEach((invoice) => {
      const row = document.createElement("tr");
      const invoiceCell = document.createElement("td");
      const invoiceNumber = document.createElement("strong");
      invoiceNumber.textContent = invoice.invoice_number || "Institutional invoice";
      const invoiceRef = document.createElement("span");
      invoiceRef.className = "invoice-ref";
      invoiceRef.textContent = formatDate(invoice.issued_at);
      invoiceCell.append(invoiceNumber, invoiceRef);
      row.appendChild(invoiceCell);

      textCell(row, String(invoice.plan || "").replace(/^university-/, "").replace(/-/g, " ") +
        " · " + String(invoice.billing_period || "").toUpperCase());
      textCell(row, formatDate(invoice.due_date));
      textCell(row, formatMoney(invoice.total_kobo, invoice.currency));
      const statusCell = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.className = "campus-invoice-status" + (invoice.status === "paid" ? " is-paid" : "");
      statusBadge.textContent = invoice.status === "paid" ? "Paid" : invoice.status === "void" ? "Voided" : "Awaiting payment";
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);
      const actionCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "campus-invoice-actions";
      if (invoice.status === "paid" && invoice.receipt?.receipt_number) {
        actions.appendChild(actionButton("View receipt", "receipt", invoice.id, true));
      } else if (invoice.status === "issued") {
        actions.appendChild(actionButton("Pay invoice", "pay", invoice.id, false));
      } else {
        const unavailable = document.createElement("span");
        unavailable.className = "muted";
        unavailable.textContent = "No action";
        actions.appendChild(unavailable);
      }
      actionCell.appendChild(actions);
      row.appendChild(actionCell);
      tbody.appendChild(row);
    });

    table.append(thead, tbody);
    wrapper.appendChild(table);
    list.appendChild(wrapper);
  }

  function appendReceiptField(grid, label, value) {
    const item = document.createElement("div");
    const small = document.createElement("small");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value || "—";
    item.append(small, strong);
    grid.appendChild(item);
  }

  function renderReceipt(payload) {
    const invoice = payload?.invoice || {};
    const receipt = payload?.receipt || {};
    receiptView.replaceChildren();
    receiptView.hidden = false;

    const paper = document.createElement("article");
    paper.className = "campus-institutional-receipt-paper";
    const kicker = document.createElement("p");
    kicker.className = "receipt-kicker";
    kicker.textContent = "CAMPUSSHIELD AI · INSTITUTIONAL BILLING";
    const title = document.createElement("h4");
    title.textContent = "Payment receipt";
    const amount = document.createElement("p");
    amount.className = "receipt-amount";
    amount.textContent = formatMoney(receipt.amount_kobo || invoice.total_kobo, receipt.currency || invoice.currency);
    const paidLabel = document.createElement("p");
    paidLabel.className = "muted";
    paidLabel.textContent = "Payment confirmed · " + formatDate(receipt.provider_paid_at || invoice.paid_at);
    const grid = document.createElement("div");
    grid.className = "campus-institutional-receipt-grid";
    appendReceiptField(grid, "Receipt number", receipt.receipt_number);
    appendReceiptField(grid, "Invoice number", invoice.invoice_number);
    appendReceiptField(grid, "Institution", payload?.university_name || invoice.bill_to_name);
    appendReceiptField(grid, "Package", String(invoice.plan || "").replace(/^university-/, "").replace(/-/g, " ") +
      " · " + String(invoice.billing_period || ""));
    appendReceiptField(grid, "Bill-to contact", receipt.customer_email || invoice.bill_to_email);
    appendReceiptField(grid, "Paystack reference", receipt.provider_reference || invoice.paid_reference);
    appendReceiptField(grid, "Transaction ID", receipt.provider_transaction_id);
    appendReceiptField(grid, "Payment environment", receipt.provider_domain);
    appendReceiptField(grid, "Verified at", formatDate(receipt.verified_at));
    const actions = document.createElement("div");
    actions.className = "campus-institutional-receipt-actions";
    const printButton = document.createElement("button");
    printButton.type = "button";
    printButton.className = "btn";
    printButton.textContent = "Print receipt";
    printButton.addEventListener("click", () => window.print());
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn secondary";
    closeButton.textContent = "Close receipt";
    closeButton.addEventListener("click", () => {
      receiptView.hidden = true;
      receiptView.replaceChildren();
    });
    actions.append(printButton, closeButton);
    paper.append(kicker, title, amount, paidLabel, grid, actions);
    receiptView.appendChild(paper);
    receiptView.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function refreshInvoices() {
    if (loading) return;
    loading = true;
    if (refreshButton) refreshButton.disabled = true;
    try {
      const data = await invoke({ action: "list_invoices" });
      authorized = true;
      panel.hidden = false;
      renderInvoices(data.invoices || []);
      setMessage(
        data.invoices?.length
          ? "Showing " + data.invoices.length + " invoice(s) issued to " + (data.university_name || "your verified university") + "."
          : "Your finance access is verified. No institutional invoices have been issued to this university yet.",
        "success",
      );
      if (callbackReference) await verifyReference(callbackReference, true);
    } catch (error) {
      authorized = false;
      panel.hidden = true;
      setMessage(error?.message || "Institutional finance access is unavailable.", "error");
    } finally {
      loading = false;
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  async function verifyReference(reference, fromCallback) {
    const normalized = String(reference || "").trim();
    if (!normalized) throw new Error("Enter the Paystack reference to reconcile.");
    setMessage("Checking the Paystack transaction against your university's invoice…", "info");
    const result = await invoke({ action: "verify_invoice_payment", reference: normalized });
    if (result.reconciled || result.verified) {
      if (referenceInput) referenceInput.value = normalized;
      setMessage(
        result.reconciled === false
          ? (result.error || "Paystack confirmed the debit, but reconciliation still needs review. Do not pay again.")
          : "Payment verified. Receipt " + (result.receipt_number || "") + " is recorded for your university.",
        result.reconciled === false ? "warning" : "success",
      );
      if (fromCallback && result.reconciled !== false) {
        callbackReference = "";
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("reference");
        nextUrl.searchParams.delete("trxref");
        nextUrl.searchParams.delete("institutional_invoice_payment");
        window.history.replaceState({}, document.title, nextUrl.pathname + nextUrl.search + nextUrl.hash);
      }
      await refreshListOnly();
      if (result.invoice_id && result.reconciled !== false) await showReceipt(result.invoice_id);
      return result;
    }
    setMessage("Payment has not yet been confirmed. You can retry verification using the same reference.", "warning");
    return result;
  }

  async function refreshListOnly() {
    const data = await invoke({ action: "list_invoices" });
    renderInvoices(data.invoices || []);
  }

  async function showReceipt(invoiceId) {
    const payload = await invoke({ action: "get_invoice_receipt", invoice_id: invoiceId });
    renderReceipt(payload);
  }

  async function handleInvoiceAction(event) {
    const button = event.target.closest("[data-invoice-action]");
    if (!button || !panel.contains(button)) return;
    const invoiceId = button.dataset.invoiceId;
    const action = button.dataset.invoiceAction;
    if (!invoiceId) return;
    button.disabled = true;
    try {
      if (action === "pay") {
        setMessage("Preparing a secure Paystack checkout for this invoice…", "info");
        const data = await invoke({ action: "initialize_invoice_payment", invoice_id: invoiceId });
        if (!/^https:\/\/checkout\.paystack\.com\//i.test(String(data.authorization_url || ""))) {
          throw new Error("Paystack did not return a valid secure checkout address.");
        }
        window.location.assign(data.authorization_url);
        return;
      }
      if (action === "receipt") await showReceipt(invoiceId);
    } catch (error) {
      setMessage(error?.message || "The invoice action could not be completed.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function boot() {
    const client = backend()?.client;
    if (!client) {
      panel.hidden = true;
      return;
    }
    panel.addEventListener("click", handleInvoiceAction);
    refreshButton?.addEventListener("click", refreshInvoices);
    reconcileButton?.addEventListener("click", async () => {
      if (!referenceInput?.value.trim()) {
        setMessage("Enter the payment reference from your Paystack receipt or transaction confirmation.", "warning");
        referenceInput?.focus();
        return;
      }
      reconcileButton.disabled = true;
      try {
        await verifyReference(referenceInput.value, false);
      } catch (error) {
        setMessage(error?.message || "The payment could not be verified.", "error");
      } finally {
        reconcileButton.disabled = false;
      }
    });
    await client.auth.getSession().then(({ data }) => {
      if (data?.session?.user) return refreshInvoices();
      panel.hidden = true;
      return null;
    }).catch(() => { panel.hidden = true; });
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        authorized = false;
        panel.hidden = true;
        receiptView.hidden = true;
        return;
      }
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        window.setTimeout(() => { void refreshInvoices(); }, 0);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void boot(); }, { once: true });
  } else {
    void boot();
  }
})();