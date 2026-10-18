
"use strict";

// ==========================================
// MEU ARRUMADINHO - SISTEMA DE GESTÃO
// Armazenamento local no navegador
// ==========================================

const STORAGE_KEY = "meu_arrumadinho_v1";
const TABLE_COUNT = 15;

const $ = (selector) => document.querySelector(selector);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initialData() {
  return {
    version: 1,
    tables: Array.from({ length: TABLE_COUNT }, (_, i) => ({
      number: i + 1,
      order: null
    })),
    products: [],
    expenses: [],
    history: [],
    counterOrders: [],
    stockMovements: []
  };
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialData();

    const data = JSON.parse(saved);

    if (
      !data ||
      !Array.isArray(data.tables) ||
      !Array.isArray(data.products) ||
      !Array.isArray(data.expenses) ||
      !Array.isArray(data.history)
    ) {
      throw new Error("Formato inválido");
    }

    // Mantém 15 mesas sem descartar pedidos já abertos.
    const tables = Array.from({ length: TABLE_COUNT }, (_, i) => {
      const existing = data.tables.find(t => t.number === i + 1);
      return existing || { number: i + 1, order: null };
    });

    return {
      version: 1,
      tables,
      products: data.products,
      expenses: data.expenses,
      history: data.history,
      counterOrders: Array.isArray(data.counterOrders)
        ? data.counterOrders
        : [],
      stockMovements: Array.isArray(data.stockMovements)
        ? data.stockMovements
        : []
    };
  } catch (error) {
    alert(
      "Não foi possível ler os dados salvos. " +
      "Se você possui um backup, use a opção Restaurar dados."
    );
    return initialData();
  }
}

let db = loadData();
let selectedTable = null;
let selectedCounterOrderId = null;
let toastTimer;

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch (error) {
    notify("Erro ao salvar. Exporte um backup e verifique o espaço disponível.");
    return false;
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function validPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function orderTotal(order) {
  return order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
}

function getSales(date) {
  return db.history
    .filter(order => order.date === date)
    .reduce((sum, order) => sum + order.total, 0);
}

function getExpenses(date) {
  return db.expenses
    .filter(expense => expense.date === date)
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function currentPage() {
  return $(".page.active")?.id || "dashboard";
}

// ==========================================
// NAVEGAÇÃO
// ==========================================

function showPage(page) {
  if (!$("#" + page)) return;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("active", section.id === page);
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const titles = {
    dashboard: "Visão geral",
    mesas: "Mesas e pedidos",
    produtos: "Produtos",
    estoque: "Estoque",
    despesas: "Despesas",
    relatorios: "Relatórios",
    historico: "Histórico de pedidos"
  };

  $("#page-title").textContent = titles[page] || "Arrumadinho e Cia";

  if (page === "mesas" && selectedTable !== null) {
    renderOrderPanel();
  }

  renderAll();
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-goto]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.goto));
});

$("#today-label").textContent = new Date().toLocaleDateString("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric"
});

$("#quick-order").addEventListener("click", () => {
  const availableTable = db.tables.find(table => !table.order);

  if (!availableTable) {
    showPage("mesas");
    notify("Todas as mesas estão ocupadas.");
    return;
  }

  openTable(availableTable.number);
});

// ==========================================
// MESAS E PEDIDOS
// ==========================================

function getTable(number) {
  return db.tables.find(table => table.number === Number(number));
}

function openTable(number) {
  const table = getTable(number);
  if (!table) return;

  if (!table.order) {
    table.order = {
      id: makeId(),
      tableNumber: table.number,
      openedAt: new Date().toISOString(),
      items: []
    };
    saveData();
  }

  selectedTable = table.number;
  selectedCounterOrderId = null;
  showPage("mesas");
  renderAll();
  renderOrderPanel();

  $("#order-panel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function openCounterOrder(type) {
  const order = {
    id: makeId(),
    orderType: type,
    openedAt: new Date().toISOString(),
    customerName: "",
    deliveryAddress: "",
    items: []
  };

  db.counterOrders.push(order);
  if (!saveData()) {
    db.counterOrders = db.counterOrders.filter(item => item.id !== order.id);
    return;
  }

  selectedTable = null;
  selectedCounterOrderId = order.id;
  showPage("mesas");
  renderOrderPanel();

  $("#order-panel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function getSelectedOrder() {
  if (selectedTable !== null) {
    const table = getTable(selectedTable);
    return table?.order ? { order: table.order, table } : null;
  }

  if (selectedCounterOrderId !== null) {
    const order = db.counterOrders.find(item =>
      item.id === selectedCounterOrderId
    );
    return order ? { order, table: null } : null;
  }

  return null;
}

function renderTables(containerId) {
  const container = $("#" + containerId);

  container.innerHTML = db.tables.map(table => {
    const occupied = Boolean(table.order);
    const total = occupied ? orderTotal(table.order) : 0;

    return `
      <button class="table-card ${occupied ? "occupied" : ""}"
        data-table="${table.number}">
        <span class="table-number">🪑 Mesa ${table.number}</span>
        <span class="table-status">
          ${occupied ? "🟠 Ocupada" : "🟢 Livre"}
        </span>
        <span class="table-value">${money(total)}</span>
        <small>${occupied ? "Abrir pedido" : "Abrir mesa"}</small>
      </button>
    `;
  }).join("");

  container.querySelectorAll("[data-table]").forEach(button => {
    button.addEventListener("click", () => {
      openTable(Number(button.dataset.table));
    });
  });
}

function populateProductSelects() {
  const orderSelect = $("#order-product");
  const stockSelect = $("#stock-product");

  const previousOrder = orderSelect.value;
  const previousStock = stockSelect.value;

  const options = db.products
    .map(product => `
      <option value="${escapeHTML(product.id)}">
        ${escapeHTML(product.name)} — ${money(product.price)}
      </option>
    `).join("");

  orderSelect.innerHTML = options ||
    '<option value="">Cadastre um produto primeiro</option>';

  stockSelect.innerHTML = options ||
    '<option value="">Cadastre um produto primeiro</option>';

  if (db.products.some(p => p.id === previousOrder)) {
    orderSelect.value = previousOrder;
  }
  if (db.products.some(p => p.id === previousStock)) {
    stockSelect.value = previousStock;
  }
}

function renderCounterOrders() {
  const container = $("#counter-orders-list");
  const orders = [...db.counterOrders].sort((a, b) =>
    b.openedAt.localeCompare(a.openedAt)
  );

  if (!orders.length) {
    container.innerHTML =
      '<div class="empty">Nenhum pedido de retirada ou entrega em andamento.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Tipo</th><th>Cliente</th><th>Total</th><th>Ação</th></tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td>${order.orderType === "delivery" ? "Entrega" : "Retirada"}</td>
              <td>${escapeHTML(order.customerName || "Cliente não informado")}</td>
              <td>${money(orderTotal(order))}</td>
              <td><button class="btn btn-light" data-open-counter-order="${escapeHTML(order.id)}">Abrir pedido</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-open-counter-order]").forEach(button => {
    button.addEventListener("click", () => {
      selectedTable = null;
      selectedCounterOrderId = button.dataset.openCounterOrder;
      renderOrderPanel();
      $("#order-panel").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });
}

function renderOrderPanel() {
  const panel = $("#order-panel");
  const context = getSelectedOrder();

  if (!context) {
    panel.classList.add("hidden");
    return;
  }

  const { order, table } = context;
  panel.classList.remove("hidden");
  const isCounterOrder = !table;
  const orderType = order.orderType;
  const typeLabel = orderType === "delivery" ? "Entrega" : "Retirada";
  $("#order-title").textContent = table
    ? `Pedido da Mesa ${table.number}`
    : `Pedido para ${typeLabel.toLowerCase()}`;
  $("#order-hint").textContent = table
    ? "Finalize o pedido para registrar o pagamento e liberar a mesa."
    : "Finalize o pedido para registrar a venda de retirada ou entrega.";

  const hasProducts = db.products.length > 0;
  $("#add-item-form").classList.toggle("hidden", !hasProducts);
  $("#order-no-products").classList.toggle("hidden", hasProducts);
  $("#order-customer-fields").classList.toggle("hidden", !isCounterOrder);
  $("#delivery-address-field").classList.toggle(
    "hidden",
    !isCounterOrder || orderType !== "delivery"
  );
  $("#order-customer-name").required = isCounterOrder;
  $("#order-customer-name").value = order.customerName || "";
  $("#delivery-address").required =
    isCounterOrder && orderType === "delivery";
  $("#delivery-address").value = order.deliveryAddress || "";

  const items = order.items;

  if (items.length === 0) {
    $("#order-items").innerHTML =
      '<div class="empty">Nenhum item adicionado a este pedido.</div>';
  } else {
    $("#order-items").innerHTML = items.map(item => `
      <div class="item-row">
        <div>
          <strong>${escapeHTML(item.name)}</strong>
          <small>${item.quantity} × ${money(item.price)}</small>
        </div>
        <strong>${money(item.quantity * item.price)}</strong>
        <button class="btn btn-danger"
          data-remove-item="${escapeHTML(item.id)}">
          Remover
        </button>
      </div>
    `).join("");
  }

  $("#order-total").textContent = money(orderTotal(order));

  $("#order-items").querySelectorAll("[data-remove-item]").forEach(button => {
    button.addEventListener("click", () => {
      removeOrderItem(button.dataset.removeItem);
    });
  });

  populateProductSelects();
}

$("#close-order-panel").addEventListener("click", () => {
  selectedTable = null;
  selectedCounterOrderId = null;
  $("#order-panel").classList.add("hidden");
});

$("#new-pickup-order").addEventListener("click", () =>
  openCounterOrder("pickup")
);

$("#new-delivery-order").addEventListener("click", () =>
  openCounterOrder("delivery")
);

$("#order-customer-name").addEventListener("input", event => {
  const context = getSelectedOrder();
  if (!context || context.table) return;
  context.order.customerName = event.target.value;
  saveData();
  renderCounterOrders();
});

$("#delivery-address").addEventListener("input", event => {
  const context = getSelectedOrder();
  if (!context || context.table) return;
  context.order.deliveryAddress = event.target.value;
  saveData();
});

$("#add-item-form").addEventListener("submit", event => {
  event.preventDefault();

  const context = getSelectedOrder();
  if (!context) {
    notify("Selecione uma mesa ou um pedido primeiro.");
    return;
  }
  const { order } = context;

  const productId = $("#order-product").value;
  const product = db.products.find(p => p.id === productId);
  const quantity = Number($("#order-quantity").value);

  if (!product) {
    notify("Cadastre um produto antes de lançar pedidos.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    notify("Informe uma quantidade inteira válida.");
    return;
  }

  const existing = order.items.find(item => item.productId === product.id);

  if (existing) {
    existing.quantity += quantity;
  } else {
    order.items.push({
      id: makeId(),
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity
    });
  }

  if (!saveData()) return;

  $("#order-quantity").value = 1;
  renderAll();
  renderOrderPanel();
  notify("Item adicionado ao pedido.");
});

function removeOrderItem(itemId) {
  const context = getSelectedOrder();
  if (!context) return;

  context.order.items = context.order.items.filter(item => item.id !== itemId);

  if (!saveData()) return;
  renderAll();
  renderOrderPanel();
  notify("Item removido.");
}

$("#finish-order").addEventListener("click", () => {
  const context = getSelectedOrder();
  if (!context) return;
  const { order, table } = context;

  if (!order.items.length) {
    notify("Adicione pelo menos um produto antes de finalizar.");
    return;
  }

  if (order.items.some(item =>
    !db.products.some(product => product.id === item.productId)
  )) {
    notify("Um produto deste pedido não existe mais no cadastro.");
    return;
  }

  if (!table) {
    order.customerName = $("#order-customer-name").value.trim();
    order.deliveryAddress = $("#delivery-address").value.trim();

    if (!order.customerName) {
      notify("Informe o nome do cliente.");
      $("#order-customer-name").focus();
      return;
    }

    if (order.orderType === "delivery" && !order.deliveryAddress) {
      notify("Informe o endereço de entrega.");
      $("#delivery-address").focus();
      return;
    }
  }

  const total = orderTotal(order);
  const description = table
    ? `a Mesa ${table.number}`
    : `${order.orderType === "delivery" ? "a entrega" : "a retirada"} para ${order.customerName}`;

  if (!confirm(`Finalizar ${description} por ${money(total)}?`)) {
    return;
  }

  const payment = $("#payment-method").value;

  if (!["Pix", "Dinheiro", "Cartão"].includes(payment)) {
    notify("Forma de pagamento inválida.");
    return;
  }

  db.history.push({
    ...order,
    orderType: table ? "table" : order.orderType,
    tableNumber: table?.number ?? null,
    date: today(),
    closedAt: new Date().toISOString(),
    total,
    payment
  });

  if (table) {
    table.order = null;
  } else {
    db.counterOrders = db.counterOrders.filter(item => item.id !== order.id);
  }

  if (!saveData()) {
    notify("Atenção: não foi possível salvar a finalização.");
    return;
  }

  selectedTable = null;
  selectedCounterOrderId = null;
  $("#order-panel").classList.add("hidden");
  renderAll();
  notify("Pedido finalizado e pagamento registrado!");
});

$("#cancel-order").addEventListener("click", () => {
  const context = getSelectedOrder();
  if (!context) return;
  const { order, table } = context;

  const orderDescription = table
    ? `o pedido aberto da Mesa ${table.number}`
    : `o pedido de ${order.orderType === "delivery" ? "entrega" : "retirada"}`;

  if (!confirm(
    `Cancelar ${orderDescription}? ` +
    "Nenhum pagamento será registrado."
  )) return;

  if (table) {
    table.order = null;
  } else {
    db.counterOrders = db.counterOrders.filter(item => item.id !== order.id);
  }
  selectedTable = null;
  selectedCounterOrderId = null;
  saveData();
  $("#order-panel").classList.add("hidden");
  renderAll();
  notify("Pedido cancelado.");
});

// ==========================================
// CADASTRO DE PRODUTOS
// ==========================================

$("#product-form").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("#product-name").value.trim();
  const price = Number($("#product-price").value);

  if (!name || !validPositiveNumber(price)) {
    notify("Confira o nome e o preço.");
    return;
  }

  if (db.products.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    notify("Já existe um produto com esse nome.");
    return;
  }

  const product = {
    id: makeId(),
    name,
    price,
    stock: 0,
    createdAt: new Date().toISOString()
  };

  db.products.push(product);

  if (!saveData()) return;

  $("#product-form").reset();
  renderAll();
  notify("Produto cadastrado com sucesso.");
});

function renderProducts() {
  const container = $("#products-list");

  if (!db.products.length) {
    container.innerHTML = '<div class="empty">Nenhum produto cadastrado.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Produto</th><th>Preço</th><th>Ação</th></tr>
        </thead>
        <tbody>
          ${db.products.map(product => `
            <tr>
              <td>${escapeHTML(product.name)}</td>
              <td>${money(product.price)}</td>
              <td><button class="btn btn-danger"
                data-delete-product="${escapeHTML(product.id)}">Excluir</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-delete-product]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteProduct;
      const product = db.products.find(p => p.id === id);
      if (!product) return;

      const inOpenOrder = db.tables.some(table =>
        table.order?.items.some(item => item.productId === id)
      ) || db.counterOrders.some(order =>
        order.items.some(item => item.productId === id)
      );

      if (inOpenOrder) {
        notify("Remova o produto dos pedidos abertos antes de excluí-lo.");
        return;
      }

      if (!confirm(`Excluir o produto "${product.name}"?`)) return;

      // Mantém o histórico antigo; remove somente do cadastro atual.
      db.products = db.products.filter(p => p.id !== id);
      saveData();
      renderAll();
      notify("Produto excluído do cadastro.");
    });
  });
}

// ==========================================
// CONTROLE DE ESTOQUE
// ==========================================

$("#stock-form").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("#stock-product").value;
  const product = db.products.find(p => p.id === id);
  const quantity = Number($("#stock-quantity").value);

  if (!product || !Number.isInteger(quantity) || quantity < 1) {
    notify("Selecione um produto e informe uma quantidade válida.");
    return;
  }

  product.stock += quantity;

  db.stockMovements.push({
    id: makeId(),
    productId: product.id,
    productName: product.name,
    type: "entrada",
    quantity,
    date: today(),
    reason: "Reposição de estoque"
  });

  if (!saveData()) return;

  $("#stock-form").reset();
  renderAll();
  notify("Entrada de estoque registrada.");
});

function renderStock() {
  const container = $("#stock-list");

  if (!db.products.length) {
    container.innerHTML = '<div class="empty">Cadastre produtos para controlar o estoque.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Produto</th><th>Quantidade</th><th>Situação</th></tr></thead>
        <tbody>
          ${db.products.map(p => `
            <tr>
              <td>${escapeHTML(p.name)}</td>
              <td>${p.stock}</td>
              <td>${p.stock === 0
                ? '<span style="color:#c53e3e">Sem estoque</span>'
                : p.stock <= 5
                  ? '<span style="color:#a96613">Estoque baixo</span>'
                  : "Disponível"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ==========================================
// DESPESAS
// ==========================================

$("#expense-date").value = today();

$("#expense-form").addEventListener("submit", event => {
  event.preventDefault();

  const description = $("#expense-description").value.trim();
  const category = $("#expense-category").value;
  const amount = Number($("#expense-amount").value);
  const date = $("#expense-date").value;

  if (!description || !validPositiveNumber(amount) ||
      !date || date > today()) {
    notify("Confira a descrição, o valor e a data da despesa.");
    return;
  }

  db.expenses.push({
    id: makeId(),
    description,
    category,
    amount,
    date,
    createdAt: new Date().toISOString()
  });

  if (!saveData()) return;

  $("#expense-form").reset();
  $("#expense-date").value = today();
  renderAll();
  notify("Despesa registrada.");
});

function renderExpenses() {
  const container = $("#expenses-list");

  const expenses = [...db.expenses].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  if (!expenses.length) {
    container.innerHTML = '<div class="empty">Nenhuma despesa registrada.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Ação</th></tr></thead>
        <tbody>
          ${expenses.map(e => `
            <tr>
              <td>${escapeHTML(e.date.split("-").reverse().join("/"))}</td>
              <td>${escapeHTML(e.description)}</td>
              <td>${escapeHTML(e.category)}</td>
              <td>${money(e.amount)}</td>
              <td><button class="btn btn-danger" data-delete-expense="${escapeHTML(e.id)}">Excluir</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-delete-expense]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteExpense;
      if (!confirm("Excluir esta despesa?")) return;

      db.expenses = db.expenses.filter(e => e.id !== id);
      saveData();
      renderAll();
      notify("Despesa excluída.");
    });
  });
}

// ==========================================
// PAINEL INICIAL
// ==========================================

function renderDashboard() {
  const date = today();
  const sales = getSales(date);
  const expenses = getExpenses(date);
  const occupied = db.tables.filter(t => t.order).length;

  $("#dash-sales").textContent = money(sales);
  $("#dash-expenses").textContent = money(expenses);
  $("#dash-profit").textContent = money(sales - expenses);
  $("#dash-tables").textContent = `${occupied}/${db.tables.length}`;

  renderTables("dashboard-tables");

  const recent = [...db.history]
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    .slice(0, 5);

  $("#dashboard-recent").innerHTML = recent.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Tipo</th><th>Pagamento</th><th>Total</th></tr></thead>
        <tbody>
          ${recent.map(o => `
            <tr>
              <td>${escapeHTML(o.date.split("-").reverse().join("/"))}</td>
              <td>${o.orderType === "delivery"
                ? `Entrega — ${escapeHTML(o.customerName || "")}`
                : o.orderType === "pickup"
                  ? `Retirada — ${escapeHTML(o.customerName || "")}`
                  : `Mesa ${o.tableNumber}`}</td>
              <td>${escapeHTML(o.payment)}</td>
              <td>${money(o.total)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : '<div class="empty">As vendas finalizadas aparecerão aqui.</div>';
}

// ==========================================
// RELATÓRIOS DIÁRIOS E MENSAIS
// ==========================================

$("#report-date").value = today();

function generateReport() {
  const type = $("#report-type").value;
  const reference = $("#report-date").value;

  if (!reference) {
    notify("Escolha uma data para gerar o relatório.");
    return;
  }

  const key = type === "day" ? reference : reference.slice(0, 7);

  const matches = date => type === "day"
    ? date === key
    : date.startsWith(key);

  const orders = db.history.filter(o => matches(o.date));
  const expenses = db.expenses.filter(e => matches(e.date));

  const sales = orders.reduce((sum, o) => sum + o.total, 0);
  const costs = expenses.reduce((sum, e) => sum + e.amount, 0);
  const result = sales - costs;

  const payments = ["Pix", "Dinheiro", "Cartão"].map(method => {
    const total = orders
      .filter(o => o.payment === method)
      .reduce((sum, o) => sum + o.total, 0);

    return `<div class="report-card">
      <span>Recebido em ${method}</span>
      <strong>${money(total)}</strong>
    </div>`;
  }).join("");

  const label = type === "day"
    ? `Dia ${reference.split("-").reverse().join("/")}`
    : `Mês ${reference.slice(5, 7)}/${reference.slice(0, 4)}`;

  $("#report-results").innerHTML = `
    <div class="panel" id="printable-report">
      <h2>Relatório ${label}</h2>
      <p>Resumo dos pedidos finalizados e despesas registradas no período.</p>
      <div class="report-grid">
        <div class="report-card"><span>Total de vendas</span><strong>${money(sales)}</strong></div>
        <div class="report-card"><span>Quantidade de pedidos</span><strong>${orders.length}</strong></div>
        <div class="report-card"><span>Despesas registradas</span><strong>${money(costs)}</strong></div>
        <div class="report-card"><span>Resultado após despesas</span><strong>${money(result)}</strong></div>
        ${payments}
      </div>
      <h3 style="margin-top:24px">Despesas do período</h3>
      ${expenses.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead>
          <tbody>${expenses.map(e => `
            <tr>
              <td>${escapeHTML(e.date.split("-").reverse().join("/"))}</td>
              <td>${escapeHTML(e.description)}</td>
              <td>${money(e.amount)}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      ` : '<div class="empty">Nenhuma despesa neste período.</div>'}
      <p class="hint">O resultado é vendas menos despesas registradas. Não desconta custos de ingredientes por prato, impostos ou outras despesas que não tenham sido lançadas.</p>
    </div>
  `;
}

$("#generate-report").addEventListener("click", generateReport);

$("#print-report").addEventListener("click", () => {
  if (!$("#printable-report")) generateReport();
  if (!$("#printable-report")) return;
  window.print();
});

// ==========================================
// HISTÓRICO DE PEDIDOS
// ==========================================

function renderHistory() {
  const dateFilter = $("#history-date").value;

  const orders = [...db.history]
    .filter(o => !dateFilter || o.date === dateFilter)
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt));

  $("#history-list").innerHTML = orders.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Tipo / cliente</th><th>Itens</th><th>Pagamento</th><th>Total</th><th>Ação</th></tr></thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td>${escapeHTML(o.date.split("-").reverse().join("/"))}</td>
              <td>${o.orderType === "delivery"
                ? `Entrega — ${escapeHTML(o.customerName || "")}<br><small>${escapeHTML(o.deliveryAddress || "")}</small>`
                : o.orderType === "pickup"
                  ? `Retirada — ${escapeHTML(o.customerName || "")}`
                  : `Mesa ${o.tableNumber}`}</td>
              <td>${o.items.map(i =>
                `${i.quantity}x ${escapeHTML(i.name)}`
              ).join(", ")}</td>
              <td>${escapeHTML(o.payment)}</td>
              <td>${money(o.total)}</td>
              <td><button class="btn btn-danger"
                data-delete-history="${escapeHTML(o.id)}">Excluir</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : '<div class="empty">Nenhum pedido encontrado para esta data.</div>';

  $("#history-list").querySelectorAll("[data-delete-history]").forEach(button => {
    button.addEventListener("click", () => {
      const orderId = button.dataset.deleteHistory;
      const order = db.history.find(item => item.id === orderId);
      if (!order) return;

      if (!confirm("Excluir este pedido finalizado do histórico?")) return;

      const previousHistory = db.history;
      db.history = db.history.filter(item => item.id !== orderId);

      if (!saveData()) {
        db.history = previousHistory;
        return;
      }

      renderAll();
      notify("Pedido excluído do histórico.");
    });
  });
}

$("#history-date").addEventListener("input", renderHistory);

// ==========================================
// ATUALIZAÇÃO GERAL DA INTERFACE
// ==========================================

function renderAll() {
  renderDashboard();
  renderTables("all-tables");
  renderCounterOrders();
  renderProducts();
  renderStock();
  renderExpenses();
  populateProductSelects();
  renderHistory();

  if (currentPage() === "relatorios") {
    generateReport();
  }

  if (selectedTable !== null || selectedCounterOrderId !== null) {
    if (getSelectedOrder()) {
      renderOrderPanel();
    } else {
      selectedTable = null;
      selectedCounterOrderId = null;
      $("#order-panel").classList.add("hidden");
    }
  }
}

// Inicialização
renderAll();
