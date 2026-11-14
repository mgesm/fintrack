# Auditoría Integral de Inversiones y Cartera (Dominio 7) — fintrack

**Auditor:** Agente 7 — Auditor Especialista en Inversiones, Cartera y Mercados  
**Fecha:** 2026-11-14  
**Repositorio:** `fintrack` (SPA monolítica en vanilla JavaScript, Supabase Backend, Deno Edge Functions)  
**Alcance:** Cartera de inversión, cotizaciones en tiempo real, Edge Function `market-data`, transacciones de compra/venta, fórmulas financieras, gráficos interactivos, modo privado y cumplimiento de invariantes de arquitectura.  
**Modo:** Solo lectura (Read-Only Audit).

---

## 1. Resumen Ejecutivo

El módulo de Inversión de `fintrack` ha evolucionado desde una simulación visual hacia un subsistema operativo conectado a mercados financieros reales (acciones, ETFs y fondos de inversión mediante Twelve Data y Yahoo Finance) con persistencia relacional en Supabase (`investment_operations` emparejada con traspasos contables en `transactions`).

Tras una inspección exhaustiva de `index.html` (617 KB), las funciones Deno en `supabase/functions/market-data/index.ts`, las migraciones SQL de base de datos (`20260901113000` a `20261026130000`) y los scripts de simulación técnica, se han detectado **12 hallazgos críticos, mayores y de optimización**. Entre ellos destacan:

1. **Riesgo crítico de pérdida irreversible de datos en la edición de operaciones (`index.html:6689`):** Al editar una operación de inversión, el cliente ejecuta un borrado no atómico (`delete_investment_operation`) seguido de un alta (`record_investment_operation`). Si el alta falla por red o validación, la operación y su traspaso contable quedan destruidos permanentemente. La función RPC atómica `update_fintrack_investment_operation` ya existe en Postgres (`20260923140000`), pero el frontend no la invoca.
2. **Defecto contable de plusvalías realizadas en traspasos:** En el modelo actual, la venta de una posición con beneficio genera un traspaso de efectivo por el importe total cobrado (coste + plusvalía) desde la cuenta de inversión hacia la cuenta bancaria. Como los traspasos no computan como ingresos en el motor contable de `fintrack`, la plusvalía real jamás se registra como ingreso y la cuenta de inversión en Cuentas adquiere un saldo teórico negativo permanente que neutraliza el incremento de patrimonio.
3. **Truncamiento severo de precisión en participaciones y NAVs (`index.html:2952, 6487, 6493`):** El modal de operaciones invoca `parseCurrencyInput()`, el cual redondea forzosamente a 2 decimales (`Math.round((n + EPSILON) * 100) / 100`). Esto trunca participaciones fraccionadas (e.g. 0.123456 a 0.12) y valores liquidativos de fondos que cotizan a 4 u 8 decimales (e.g. 16.4232 € se trunca a 16.42 €).
4. **Fallo de clasificación en Asset Allocation (`index.html:6593-6594`):** Twelve Data clasifica los ETFs como `"Exchange Traded Fund"`. La función `normalizeAssetType` busca la subcadena `'etf'` (que no coincide) y cae en la siguiente regla `'fund'` / `'fondo'`, categorizando erróneamente todos los ETFs como `"Fondos"`.
5. **Fuga visual en Modo Privado (`index.html:6487`):** En el modal de compra/venta, cuando se opera en modo "Por participaciones", el resumen muestra el total en euros con `fmt(total)` sin comprobar `portfolioValueHidden()`, desvelando importes monetarios cuando la privacidad de cartera está activa.
6. **Desprotección de transacciones de inversión en el modal general (`index.html:7036, 7209`):** Si la privacidad de cartera está desactivada, `editTx` permite abrir y guardar traspasos de inversión desde la lista de movimientos; al guardar, `saveTx` sobreescribe `tags: []`, eliminando las etiquetas protectoras `invest_operation` y desincronizando la tabla `investment_operations`.
7. **Exposición a límites de tasa de Twelve Data y volatilidad de caché:** `_quoteCache` es un objeto efímero en memoria RAM con TTL de 5 minutos (sin persistencia en `localStorage`/`IndexedDB`). En carteras con más de 8 activos, la carga paralela excede la cuota gratuita de Twelve Data (8 créditos/minuto), provocando fallos HTTP 429/400 y valoraciones híbridas silenciosas.

---

## 2. Estructura de Datos de Posiciones y Motor de Valoración

### 2.1 Esquema Relacional e Hidratación del Estado
En base de datos, las operaciones se almacenan en la tabla `public.investment_operations` (creada en `20260901113000_investment_operations.sql` y blindada en `20261026130000_investment_tags_and_safety.sql`):
```sql
create table if not exists public.investment_operations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('buy','sell')),
  symbol text not null,
  product_name text not null,
  product_type text,
  units numeric not null check (units > 0),
  unit_price numeric not null check (unit_price > 0),
  amount numeric not null check (amount > 0),
  operation_date date not null,
  cash_account_id text not null,
  investment_account_id text not null,
  transaction_id text not null unique,
  created_at timestamptz not null default now()
);
```

En el cliente (`index.html:3874`), los datos se cargan durante `loadData()` mediante:
```javascript
fetchAllTableRows('investment_operations', {col:'operation_date', asc:false})
```
e hidratan la variable global `investmentOperations` (`index.html:3882`).

### 2.2 Agregación de Posiciones (`investmentPositionList`)
La función `investmentPositionList()` (`index.html:6568-6589`) calcula la cartera viva agrupando operaciones por símbolo:
```javascript
function investmentPositionList(){
  var bySymbol={};
  var ops=investmentOperations.slice().sort(function(a,b){
    var d=String(a.operation_date).localeCompare(String(b.operation_date));
    if(d!==0)return d;
    return String(a.created_at||a.id||'').localeCompare(String(b.created_at||b.id||''));
  });
  ops.forEach(function(o){
    var key=o.symbol;
    if(!bySymbol[key])bySymbol[key]={symbol:key,name:o.product_name||key,type:o.product_type||'Producto',units:0,cost:0};
    var p=bySymbol[key],u=Number(o.units),a=Number(o.amount);
    if(o.side==='buy'){
      p.units+=u;
      p.cost+=a;
    }else if(p.units>0){
      p.cost-=p.cost*(u/p.units);
      p.units-=u;
      if(p.units<=0.0000001){p.units=0;p.cost=0;}
    }
  });
  return Object.keys(bySymbol).map(function(k){return bySymbol[k];}).filter(function(p){return p.units>0.0000001;});
}
```

#### Defecto en la ordenación secundaria (Mismo día: Compra vs. Venta)
- **Observación:** El ordenamiento secundario utiliza `String(a.created_at || a.id || '').localeCompare(String(b.created_at || b.id || ''))`.
- **Caso límite:** Si un usuario compra y vende el mismo día (e.g., compra de apertura y venta de cierre), pero introduce la venta en la app antes que la compra (e.g. olvida registrar la compra y la añade minutos después), `created_at` de la venta será menor que el de la compra.
- **Consecuencia:** En la fecha compartida, la venta se procesa primero cuando `p.units === 0`. La condición `else if(p.units > 0)` evalúa a `false`, por lo que la venta es omitida por completo. Luego se procesa la compra y la posición queda con participaciones no vendidas, corrompiendo el cálculo de balance y cartera.
- **Corrección requerida:** En fechas idénticas, las compras deben procesarse obligatoriamente antes que las ventas:
  ```javascript
  if (d !== 0) return d;
  if (a.side !== b.side) return a.side === 'buy' ? -1 : 1;
  return String(a.created_at || a.id || '').localeCompare(String(b.created_at || b.id || ''));
  ```

### 2.3 Valoración de Mercado Híbrida y Caída Silenciosa
En `refreshInvestmentMarketValue()` (`index.html:6651-6655`):
```javascript
var valid=rows.filter(Boolean);
var value=positions.reduce(function(s,p,i){return s+(rows[i]?rows[i].value:p.cost);},0);
var cost=positions.reduce(function(s,p){return s+p.cost;},0);
var pct=cost?(value-cost)/cost*100:0;
if(totalEl)totalEl.textContent=portfolioValueText(valid.length?fmt(value):fmt(cost));
```
- **Observación:** Si una posición no obtiene cotización (por fallo de red, rate limit de Twelve Data o símbolo inválido), `rows[i]` es `null`.
- **Riesgo:** El cálculo suma `rows[i].value` para los activos con cotización y `p.cost` para los activos fallidos. Esto genera una **valoración híbrida no homogénea**.
- **Impacto Financiero:** Si un usuario tiene 2 posiciones (Posición A: coste 1.000 €, valor 2.000 €; Posición B: coste 10.000 €, valor 15.000 €) y la cotización de B falla, el valor total mostrado pasa de 17.000 € a 12.000 € (2.000 € + 10.000 €), y la rentabilidad aparente colapsa de +54,5% a +9,1%, sin que el usuario reciba aviso alguno de que la Posición B está valorada a coste histórico por falta de datos.

### 2.4 Discontinuidad en la Gráfica Anual (`index.html:6358-6372`)
En la pestaña Anual, para la serie de inversión (`isInv`):
```javascript
if(isInv){
  var pVal=investmentPortfolioValueAsOf(a.id==='__investments__'?null:a.id,endOfMonth);
  if(pVal!==null)return pVal;
  if(chartYear===realY&&m>=(realNow.getMonth())){
    var curVal=investmentPortfolioValueAsOf(null,todayStr());
    if(curVal!==null)return curVal;
  }
  return firstDate?0:null;
}
```
Y en `investmentPortfolioValueAsOf` (`index.html:5528-5533`):
```javascript
return pos.reduce(function(total,p){
  var q=_quoteCache[String(p.symbol||'').toUpperCase()];
  var price=Number(q&&(q.data?(q.data.price||q.data.close||q.data.regularMarketPrice):(q.price||q.close||q.regularMarketPrice)));
  var val=(isCurrentOrFuture&&Number.isFinite(price)&&price>0)?(p.units*price):p.cost;
  return total+val;
},0);
```
- **Observación 1:** `_quoteCache` es una variable en memoria RAM. Si el usuario abre directamente la pestaña Anual al iniciar sesión, `_quoteCache` está vacía, por lo que toda la serie anual se dibuja a coste acumulado (`p.cost`).
- **Observación 2:** Si el usuario visitó previamente la pestaña Inversión y `_quoteCache` está llena, los meses pasados (`!isCurrentOrFuture`) devuelven `p.cost`, mientras que el mes actual devuelve `p.units * price`. Esto provoca un escalón vertical irreal entre el mes pasado y el mes actual en el gráfico de evolución patrimonial.

---

## 3. Cotizaciones en Tiempo Real, Edge Function y Caché

### 3.1 Arquitectura de la Edge Function `market-data`
Ubicación: `supabase/functions/market-data/index.ts` (179 líneas).
- **Seguridad:** Requiere JWT válido de usuario autenticado (`supabase.auth.getUser(token)` en líneas 125-137). Responde con cabeceras CORS estrictas `Access-Control-Allow-Origin: https://mgesm.github.io` (líneas 4-9). El secreto `TWELVE_DATA_API_KEY` reside exclusivamente en las variables de entorno de Supabase.
- **Rutas de Proveedor:**
  1. **Fondos y Códigos Morningstar:** Detectados por `isIsin(input) || input.toUpperCase().startsWith("0P")` (línea 145). Se resuelven contra Yahoo Finance y la tabla interna `knownFunds`.
  2. **Acciones y ETFs:** Se resuelven contra Twelve Data (`api.twelvedata.com/quote`, `/symbol_search`, `/time_series`).

### 3.2 Límite de Tasa de Twelve Data y Saturación de Peticiones
- **Condición de Proveedor:** El plan gratuito de Twelve Data impone un límite estricto de **8 créditos/minuto** y 800 créditos/día.
- **Mecanismo del Cliente (`index.html:6644-6649`):**
  ```javascript
  Promise.all(positions.map(function(p){
    return getCachedQuote(p.symbol,300000).then(...);
  }))
  ```
- **Fallo Detectado:** Al entrar en la pestaña Inversión con una cartera de e.g. 10 activos (acciones y ETFs), el cliente dispara 10 invocaciones simultáneas a la Edge Function. Como la Edge Function no hace agregación ni batching (llama a Twelve Data con un único símbolo por petición, línea 164), se envían 10 peticiones concurrentes a Twelve Data en menos de 1 segundo.
- **Consecuencia:** A partir de la petición 9, Twelve Data rechaza las llamadas con error de cuota:
  `{ "status": "error", "message": "You have reached the API call rate limit..." }`
  La Edge Function lanza `Error` (línea 173) y devuelve HTTP 400. Las posiciones 9 y 10 fallan y quedan valoradas a coste.

### 3.3 Riesgos de Confiabilidad en el Fallback de Yahoo Finance
- **Implementación:** `getYahooSearch` y `yahooChart` realizan peticiones HTTP a `query1.finance.yahoo.com` y `query2.finance.yahoo.com` con cabeceras simuladas de navegador (`User-Agent: Mozilla/5.0...`, líneas 23-26).
- **Vulnerabilidad:** Los endpoints no oficiales de Yahoo Finance bloquean de forma agresiva rangos IP de centros de datos (como los workers de Supabase / AWS / GCP). Yahoo suele requerir cookies de sesión (`A1`/`A3`) y tokens de crumb; sin ellos, responde con HTTP 401/403.
- **Mitigación Parcial Existente:** En caso de fallo total, la función consulta `knownFunds`:
  ```typescript
  const knownFunds: Record<string, { symbol: string; twelveSymbol: string; name: string; lastPublishedNav: number; navDate: string }> = {
    IE00BYX5MX67: { symbol: "0P0001CLDM.F", twelveSymbol: "FEP7:GER", name: "Fidelity S&P 500 Index Fund P-ACC-EUR", lastPublishedNav: 16.4232, navDate: "2026-09-04" },
    IE00BYX5NX33: { symbol: "0P0001CLDK.F", twelveSymbol: "", name: "Fidelity MSCI World Index Fund P-ACC-EUR", lastPublishedNav: 14.2305, navDate: "2026-09-04" },
    IE00B03HCZ61: { symbol: "0P00000RQC.F", twelveSymbol: "", name: "Vanguard Global Stock Index Inv EUR Acc", lastPublishedNav: 53.12, navDate: "2026-09-04" },
  };
  ```
- **Incumplimiento de Invariante:** Cuando se utiliza el NAV de respaldo, la Edge Function devuelve:
  `{ symbol, name, price: String(known.lastPublishedNav), currency: "EUR", is_backup_nav: true, nav_date: known.navDate }` (línea 86).
  Sin embargo, el cliente en `index.html:2652` **ignora completamente `is_backup_nav` y `nav_date`**. Muestra el valor estático sin advertencia alguna ni fecha de vigencia, contraviniendo `PROJECT_CONTEXT.md` §4.6 ("Un valor estático es solo respaldo y debe presentarse como tal, no como cotización en tiempo real").

### 3.4 Auditoría de la Caché Local `_quoteCache` y TTL
- **Ubicación:** `index.html:2647-2663`.
- **Estructura:** Variable en memoria `var _quoteCache = {};`.
- **TTL Configurado:**
  - Definición por defecto: `maxAgeMs || 300000` (5 minutos = 300.000 ms, línea 2650).
  - Modal de operativa: `getCachedQuote(asset.symbol, 180000)` (3 minutos, línea 6492).
  - Ficha de activo y cartera: `getCachedQuote(symbol, 300000)` (5 minutos, líneas 6552, 6645).
- **Problema de Persistencia:** Al cerrar la PWA, recargar la página o cambiar de aplicación en móvil, `_quoteCache` se borra al 100%. Si el usuario entra a la app sin conexión a internet, todas las cotizaciones son `null`. No existe persistencia en `localStorage` ni en el IndexedDB cifrado (`fintrack-secure-cache`).

---

## 4. Flujos de Operaciones de Compra/Venta y Traspasos Vinculados

### 4.1 Emparejamiento Dual Atómico en Base de Datos
La función PostgreSQL `record_investment_operation` (`supabase/migrations/20261026130000_investment_tags_and_safety.sql`) garantiza la integridad referencial al registrar una operación:
1. Valida que el usuario sea el propietario (`auth.uid() = uid`).
2. Valida importes positivos y que `cash_account_id` no sea una cuenta de inversión.
3. Localiza o crea la cuenta de inversión del usuario (`accounts.is_investment = true`).
4. Genera `tx_id` e inserta el traspaso en `public.transactions` con categoría `'investment'` y etiquetas `['invest_operation', 'invest_buy'/'invest_sell']`:
   - En compra: de `cash_account_id` a `inv_id`.
   - En venta: de `inv_id` a `cash_account_id`.
5. Inserta el registro en `public.investment_operations` vinculando `transaction_id = tx_id`.

### 4.2 Defecto Crítico: Edición No Atómica en el Frontend (`index.html:6689`)
Al pulsar sobre una operación en la lista de movimientos para editarla, se invoca `openInvestmentOperationEdit(id)`:
```javascript
// index.html:6689
submit.onclick = async function() {
  ...
  submit.disabled = true;
  var del = await sb.rpc('delete_investment_operation', { p_operation_id: o.id });
  if (del.error) { alert(del.error.message); submit.disabled = false; return; }
  
  var r = await sb.rpc('record_investment_operation', {
    p_side: o.side,
    p_symbol: o.symbol,
    p_product_name: o.product_name,
    p_product_type: o.product_type || null,
    p_units: units,
    p_unit_price: p,
    p_amount: total,
    p_operation_date: d,
    p_cash_account_id: acc
  });
  if (r.error) {
    alert('No se pudo guardar: ' + r.error.message);
    submit.disabled = false;
    return;
  }
  m.remove();
  await loadData();
  showSuccessToast('Operación actualizada');
};
```
- **Gravedad:** **CRÍTICA**.
- **Análisis del Fallo:**
  1. `delete_investment_operation` elimina físicamente la operación de `investment_operations` y el traspaso de `transactions`.
  2. Si `record_investment_operation` falla inmediatamente después (e.g., error 500 en Supabase, desconexión de red, validación de fecha, o cuota superada), **la operación original ya ha sido borrada de la base de datos**.
  3. El usuario pierde irrevocablemente su registro contable y su historial de compra/venta.
  4. Además, aunque el alta tenga éxito, se generan un nuevo `op_id` y un nuevo `tx_id`, rompiendo trazabilidad e invalidando cualquier referencia previa.
- **Solución Existente Ignorada:** En la migración `20260923140000_security_and_integrity_fixes.sql` ya se diseñó e implementó la función transaccional atómica:
  `public.update_fintrack_investment_operation(p_operation_id, p_side, p_symbol, p_product_name, p_product_type, p_units, p_unit_price, p_amount, p_operation_date, p_cash_account_id)`
  El frontend jamás fue actualizado para llamarla.

### 4.3 Fuga de Edición y Destrucción de Etiquetas en `editTx` (`index.html:7036, 7209`)
- **Fallo:** En `editTx(id)`:
  ```javascript
  if(portfolioValueHidden()&&(isAccountInvestment(tx.account_id)||isAccountInvestment(tx.to_account_id)||investmentOperations.some(function(op){return op.transaction_id===tx.id;}))){
    showUndoToast('Desactiva el modo privado para ver o editar movimientos de inversión');
    return;
  }
  ```
  Si el modo privado de cartera **NO** está activo, la comprobación se evalúa como falsa y el traspaso de inversión se abre en el modal estándar de transacciones.
- **Consecuencia en `saveTx()` (`index.html:7209`):**
  Al guardar un traspaso, el código reconstruye el objeto:
  `payload = { type:'transfer', amount:amount, category:'transfer', ..., tags:[], account_id:fromAcc, to_account_id:toAcc };`
  Se sobreescribe `tags` con un array vacío `[]`.
  1. Se eliminan las etiquetas `invest_operation`, `invest_buy` e `invest_sell`.
  2. Al perder las etiquetas, `deleteTx()` ya no reconoce la transacción como de inversión y permite borrarla libremente, dejando la fila en `investment_operations` huérfana de traspaso.
  3. Los cambios de importe o fecha introducidos en el modal de transacciones no se propagan a `investment_operations`, desincronizando ambas tablas.

### 4.4 Errata en la Comprobación de Borrado de Cuenta (`index.html:5975`)
En `deleteAccount(id)`:
```javascript
var inOps=(investmentOperations||[]).some(function(op){return op.cash_account_id===id||op.account_id===id;});
```
- **Defecto:** La tabla `investment_operations` no tiene ninguna columna llamada `account_id`. Las columnas son `cash_account_id` e `investment_account_id`.
- **Efecto:** `op.account_id === id` siempre devuelve `false`. Si el usuario intenta eliminar su cuenta de inversión desde la interfaz de Cuentas, la validación del lado del cliente no detecta que es la cuenta receptora de operaciones de inversión (aunque el backend en `20260923140000` la bloqueará por base de datos, el cliente emite una confirmación de borrado crítica engañosa).

---

## 5. Matemáticas Financieras, Plusvalías y Asignación de Activos

### 5.1 La Gran Anomalía Contable: Traspasos vs. Plusvalías Realizadas
`fintrack` sigue un modelo contable de tres estados (tri-state accounting) donde los traspasos (`transfer`) son neutros (no computan como gastos ni como ingresos).
- **Flujo de Compra:** 10 participaciones a 100 € = 1.000 €.
  - Cuenta Efectivo: -1.000 € (traspaso saliente).
  - Cuenta Inversión: +1.000 € (traspaso entrante).
  - Patrimonio en Cuentas: Sin variación neta.
- **Flujo de Venta con Plusvalía:** Se venden las 10 participaciones a 150 € = 1.500 € (plusvalía de +500 €).
  - La función `record_investment_operation` genera un traspaso de 1.500 € desde Cuenta Inversión hacia Cuenta Efectivo.
  - Cuenta Efectivo: +1.500 €.
  - Cuenta Inversión: 1.000 € - 1.500 € = **-500 €**.
  - Patrimonio Total en Cuentas: $(Efectivo + 1.500) + (Inversión - 500) = Saldo\ Inicial$.
- **Consecuencias Contables:**
  1. La ganancia patrimonial de 500 € **no figura en los ingresos del mes**, desvirtuando el balance de ingresos/gastos y la tasa de ahorro.
  2. La cuenta de inversión en la pestaña Cuentas queda con un **saldo negativo perpetuo** de -500 €, a pesar de que el usuario ya no posee ninguna posición abierta ni deuda alguna.
  3. El total de patrimonio calculado en Cuentas permanece idéntico a antes de invertir, neutralizando la rentabilidad real generada.

### 5.2 Truncamiento Numérico en Entradas de Participaciones y NAV (`index.html:2952`)
En `parseCurrencyInput(val)`:
```javascript
var n=parseFloat(s);
return Number.isFinite(n)?roundMoney(n):NaN;
```
Y `roundMoney(n)`:
```javascript
return Math.round((n+Number.EPSILON)*100)/100;
```
En el modal de compra/venta (`index.html:6487, 6493`):
```javascript
var v=parseCurrencyInput(amount.value), p=parseCurrencyInput(price.value);
```
- **En modo "Por participaciones":** Si un usuario adquiere `15,482910` participaciones de un fondo indexado, `parseCurrencyInput("15,482910")` lo redondea a `15,48` participaciones. Se pierden 0,00291 participaciones en cada operación.
- **En el precio de fondos (NAV):** Fondos internacionales como `IE00BYX5MX67` cotizan con precisión de hasta 8 decimales (e.g. 16,4232 €). Al introducir el NAV, `parseCurrencyInput("16,4232")` lo convierte forzosamente en `16,42 €`, distorsionando el importe total y la base de coste.
- **Solución:** Implementar `parseUnitsInput(val)` sin truncamiento forzado a 2 decimales para unidades y precios unitarios de mercado.

### 5.3 Error de Categorización en Distribución de Cartera (`normalizeAssetType`)
En `index.html:6590-6599`:
```javascript
function normalizeAssetType(raw){
  if(!raw)return 'Otros';
  var t=String(raw).toLowerCase().trim();
  if(t.indexOf('etf')!==-1)return 'ETFs';
  if(t.indexOf('fondo')!==-1||t.indexOf('fund')!==-1)return 'Fondos';
  if(t.indexOf('acci')!==-1||t.indexOf('stock')!==-1||t.indexOf('equity')!==-1||t.indexOf('share')!==-1)return 'Acciones';
  ...
}
```
- **Error:** Twelve Data devuelve el tipo estándar `"Exchange Traded Fund"` para ETFs internacionales (como SPY, VUSA, VWCE).
- En `"exchange traded fund"`, la subcadena `'etf'` **no aparece**.
- La siguiente regla evalúa `t.indexOf('fund') !== -1`, que **sí coincide**.
- **Resultado:** Todos los ETFs catalogados por Twelve Data como "Exchange Traded Fund" se visualizan en la barra de Asset Allocation como **"Fondos"**, arruinando la segmentación entre Fondos de Inversión convencionales y ETFs.
- **Corrección requerida:**
  ```javascript
  if(t.indexOf('etf')!==-1||t.indexOf('exchange traded fund')!==-1||t.indexOf('exchange-traded fund')!==-1)return 'ETFs';
  ```

### 5.4 Ceguera de Divisas (Ausencia de Conversión FX)
- Twelve Data cotiza acciones estadounidenses (e.g. AAPL, MSFT, SPY) en dólares (`USD`), y fondos de UK en libras (`GBP`).
- `fintrack` asume euros en todas las operaciones: divide euros entre dólares al calcular participaciones (`units = v / p`), y luego multiplica participaciones por dólares mostrando el resultado con el símbolo de euro (`fmt(val)`).
- La falta de conversión por tipo de cambio genera desviaciones de hasta un 10%-15% en la valoración real según la cotización del EUR/USD.

---

## 6. Renderizado de Gráficos e Inspección Visual

### 6.1 Gráfica de Detalle de Producto (`assetGraph`)
La función `assetGraph(values)` (`index.html:6397-6406`) renderiza un SVG responsivo de 320x100 (`viewBox="0 0 320 100" preserveAspectRatio="none"`):
- Traza polilínea con grosor fino (`stroke-width="1.6"`), renderizado geométrico preciso y gradiente de relleno verde/rojo según tendencia.
- La serie se ordena cronológicamente: `values.sort((a,b) => String(a.datetime||a.date).localeCompare(String(b.datetime||b.date)))`.

### 6.2 Defectos Detectados en Gráficos y Tooltips

#### 1. Salto de Día en el Tooltip por Zona Horaria (`index.html:6419`)
```javascript
raw=points[i].datetime||points[i].date||'', date=raw?new Date(raw.replace(' ','T')).toLocaleString('es-ES', {...}):'Sin fecha';
```
- Si `raw` es `"2026-09-04"`, `new Date("2026-09-04")` es parseado por JavaScript como medianoche UTC (`00:00:00Z`).
- Para usuarios que utilicen la aplicación en husos horarios occidentales negativos (e.g., Canarias en invierno, América Latina o si viajan), la fecha se desfasa automáticamente al día anterior (`2026-09-03 23:00:00`), mostrando fechas incorrectas al pasar el cursor o dedo sobre el gráfico.
- En fintrack debe usarse `new Date(raw.slice(0,10) + 'T12:00:00')` para evitar el desplazamiento por zona horaria.

#### 2. Desbordamiento y Corte del Tooltip en Móvil (`index.html:6420`)
```javascript
tip.style.left=(x/320*100)+'%';
tip.style.top=(y/100*142+22)+'px';
```
- La clase `.asset-chart-tooltip` aplica `transform: translate(-50%, -100%)`.
- Cuando el cursor se sitúa en $x=0$ (primer día), el tooltip se centra en `left: 0%`, desbordando un 50% de su anchura hacia la izquierda de la pantalla y quedando cortado en dispositivos móviles.
- Igualmente, cuando $y \approx 0$ (máximo histórico del periodo), `top: 22px` con `translate(-50%, -100%)` empuja el tooltip fuera del contenedor superior o solapa con los textos de `Mín.` y `Máx.`.
- Se requiere limitar el valor `left` entre el 15% y el 85%.

#### 3. Escala Colapsada en Series Planas
Si todos los valores de un periodo son idénticos (e.g., fondos con NAV estático o activos sin negociación), `span = max - min || 1`. La coordenada $y$ resultante es fija en $94 - 0 = 94$, dibujando una línea pegada al borde inferior del gráfico en vez de centrarla en $y=50$.

#### 4. Selector YTD Indiferenciado de 1A (`index.html:6396`)
`assetRangeConfig` asigna para `ytd`: `{ interval:'1day', outputsize:366 }`, exactamente el mismo tamaño que para `y` (1 año). Como no se aplica ningún filtro posterior por el año en curso (`datetime >= currentYear-01-01`), el rango `YTD` y el rango `1A` muestran exactamente la misma gráfica de 366 días.

### 6.3 Código Muerto y Observadores DOM Globales

#### Código Muerto: `bindAssetGraph` (`index.html:6407-6414`)
La función `bindAssetGraph(chart, values)` está definida en el ámbito global pero **no se invoca en ningún lugar del código**. Las interacciones del gráfico se manejan exclusivamente a través de los escuchadores globales de eventos puntero (`index.html:6428-6431`) que llaman a `inspectAssetGraph`.

#### Sobrecarga de `MutationObserver` en `document.body`
- `assetPeriodObserver` (`index.html:6439-6440`): Observa `document.body` con `{ subtree:true, childList:true, characterData:true }` en busca de `.asset-sheet`. Se dispara ante cualquier mutación en toda la aplicación.
- `investmentLogoObserver` (`index.html:6426-6427`): Observa `document.body` con `{ subtree:true, childList:true }` y ejecuta un `querySelectorAll` global para logotipos en cada mutación.
- Ambos observadores deben desconectarse cuando la pestaña Inversión o la ficha no están presentes en el viewport.

#### Manipulación Imperativa del DOM en `renderInvestmentsTab` (`index.html:6699`)
`renderInvestmentsTab` genera una plantilla HTML inicial y luego ejecuta 5 llamadas a `insertAdjacentElement` para recolocar secciones (`allocEl`, `portfolioHead`, `positionsEl`, `operationsEl`). Una ordenación directa en el string del template eliminaría por completo esta mutación innecesaria.

---

## 7. Cumplimiento de Invariantes y Modo Privado

| Invariante de fintrack | Estado | Observación en la Auditoría |
|---|---|---|
| **Separación Capital Invertido vs. Valoración** | ⚠️ En riesgo | En Cuentas, la cuenta de inversión refleja las aportaciones dinerarias vía transferencias. Sin embargo, al vender con beneficio, el saldo de la cuenta se vuelve negativo, rompiendo la representación fiel del capital. |
| **Privacidad de Cartera (`portfolioValueHidden`)** | ⚠️ Fuga leve | Oculta con `'••••••'` el valor total, invertido, rentabilidad, posiciones y saldos en Cuentas y Anual. Pero en el modal de operativa (modo unidades), `fmt(total)` se imprime en texto plano revelando el importe en euros. |
| **Zero Emojis** | ✅ Conforme | Todos los iconos son SVGs monomáticos en línea (`viewBox="0 0 24 24"`). Cero caracteres Unicode decorativos. |
| **Zero Build Tools / Monolito Vanilla** | ✅ Conforme | Todo el código de inversión reside directamente en `index.html` y Deno Edge Runtime sin transpiladores ni bundlers. |
| **Casing de Marca `fintrack`** | ✅ Conforme | Respetado en títulos, pies de página y configuración (`fintrack` en minúsculas). |
| **Protección contra Borrado Accidental** | ⚠️ Vulnerabilidad | Las etiquetas `invest_operation` protegen contra `deleteTx`, pero editar la transacción desde el modal general (`editTx` + `saveTx`) vacía las etiquetas a `[]`, anulando la protección. |

---

## 8. Matriz de Priorización (Impacto vs. Esfuerzo)

| ID | Hallazgo / Acción Propuesta | Impacto | Esfuerzo | Fase Recomendada |
|---|---|---|---|---|
| **INV-01** | **Sustituir borrado/alta no atómico por `update_fintrack_investment_operation` en la edición de operaciones (`index.html:6689`).** Elimina el riesgo de pérdida irreversible de datos. | **Alto** | **Bajo** | Fase 1 (Crítica) |
| **INV-02** | **Bloquear edición de transferencias de inversión en `editTx` (`index.html:7036`) e impedir que `saveTx` sobreescriba `tags: []`.** Evita la desincronización de tablas y la desprotección contra borrado. | **Alto** | **Bajo** | Fase 1 (Crítica) |
| **INV-03** | **Corregir truncamiento de decimales en participaciones y NAVs (`index.html:2952, 6487, 6493`).** Introducir parser específico para participaciones (hasta 6 decimales) y precios (hasta 4 decimales). | **Alto** | **Bajo** | Fase 1 (Crítica) |
| **INV-04** | **Corregir la clasificación de ETFs en Asset Allocation (`index.html:6593`).** Reconocer la cadena `"exchange traded fund"` para evitar que los ETFs se muestren como fondos. | **Alto** | **Bajo** | Fase 1 (Crítica) |
| **INV-05** | **Subsanar fuga de privacidad en el modal de operativa (`index.html:6487`).** Enmascarar `fmt(total)` con `'••••••'` cuando `portfolioValueHidden()` esté activo en modo unidades. | **Medio** | **Bajo** | Fase 1 (Crítica) |
| **INV-06** | **Corregir errata en `deleteAccount` (`index.html:5975`).** Cambiar `op.account_id` por `op.investment_account_id`. | **Medio** | **Bajo** | Fase 1 (Crítica) |
| **INV-07** | **Añadir ordenación secundaria por tipo de operación (Compra antes que Venta en misma fecha) en `investmentPositionList` (`index.html:6571`).** | **Medio** | **Bajo** | Fase 2 (Lógica) |
| **INV-08** | **Presentar distintivo visual y fecha cuando se use NAV de respaldo estático (`market-data/index.ts:86`, `index.html:2652`).** Cumplir con la obligación de informar sobre valor estático. | **Medio** | **Medio** | Fase 2 (Lógica) |
| **INV-09** | **Corregir desfase de fecha por zona horaria en tooltips del gráfico (`index.html:6419`) y limitar los bordes horizontales del tooltip.** | **Medio** | **Bajo** | Fase 2 (Lógica) |
| **INV-10** | **Eliminar código muerto `bindAssetGraph` y sanear la mutación imperativa en `renderInvestmentsTab` (`index.html:6407, 6699`).** | **Bajo** | **Bajo** | Fase 3 (Refactor) |
| **INV-11** | **Optimizar `MutationObserver` globales:** Conectar `investmentLogoObserver` y `assetPeriodObserver` solo cuando el contenedor de inversión esté activo en el DOM. | **Medio** | **Medio** | Fase 3 (Refactor) |
| **INV-12** | **Persistir `_quoteCache` en `localStorage`/IndexedDB y añadir aviso visual en valoraciones híbridas:** Evitar sobrepasar límites de Twelve Data y soportar visualización offline de cotizaciones recientes. | **Alto** | **Medio** | Fase 3 (Refactor) |
| **INV-13** | **Diseño arquitectónico para la contabilidad de plusvalías realizadas:** Desvincular el saldo negativo de la cuenta de inversión o registrar el componente de plusvalía como ganancia patrimonial. | **Alto** | **Alto** | Fase 4 (Evolutivo) |

---

## 9. Riesgos de Regresión y Consideraciones de Seguridad

1. **Riesgo en la migración a `update_fintrack_investment_operation`:** La función RPC en Postgres actualiza simultáneamente la transacción vinculada y la operación. Es necesario asegurar que los parámetros pasados coincidan exactamente con la firma de la base de datos (tipos `numeric` y `date`) para evitar fallos de invocación RPC.
2. **Riesgo de bloqueo al impedir la edición en `editTx`:** Si un usuario intenta editar un traspaso de inversión desde la lista de transacciones general, debe recibir un toast explicativo claro indicándole que las operaciones de compra y venta se gestionan y editan desde la pestaña Inversión.
3. **Riesgo de cuota en Twelve Data durante pruebas:** Cualquier test automatizado que invoque la Edge Function con múltiples símbolos reales consumirá la cuota de la API. Las pruebas de carga o regresión deben realizarse mockeando la respuesta de la función o utilizando los fondos de prueba estáticos de `knownFunds`.

---

## 10. Pasos de Verificación Independiente

Para verificar las observaciones de este informe sin alterar el código de producción:

1. **Inspección del Fallo de Edición No Atómica:**
   - Abrir `index.html` en la línea 6689. Comprobar que `submit.onclick` invoca consecutivamente `sb.rpc('delete_investment_operation')` y `sb.rpc('record_investment_operation')`.
   - Abrir `supabase/migrations/20260923140000_security_and_integrity_fixes.sql` en la línea 70 para comprobar la existencia de la función RPC atómica `update_fintrack_investment_operation`.
2. **Inspección del Truncamiento de Precisión:**
   - Abrir `index.html` en las líneas 2951-2953 (`parseCurrencyInput`) y 6487 (`parseCurrencyInput(amount.value)`).
   - Simular en consola del navegador `parseCurrencyInput('12,345678')`: devolverá `12.35`.
3. **Inspección del Fallo de Clasificación de ETFs:**
   - Abrir `index.html` en la línea 6593 (`normalizeAssetType`).
   - Ejecutar en consola: `normalizeAssetType('Exchange Traded Fund')`: devolverá `"Fondos"` en lugar de `"ETFs"`.
4. **Inspección del Filtrado de Tags en `saveTx`:**
   - Abrir `index.html` en la línea 7209. Comprobar que en `txType === 'transfer'`, el payload define `tags: []`.
5. **Inspección de la Errata en `deleteAccount`:**
   - Abrir `index.html` en la línea 5975. Comprobar que el código evalúa `op.account_id === id` en lugar de `op.investment_account_id === id`.
6. **Inspección del Tooltip y Fecha en Gráfica:**
   - Abrir `index.html` en la línea 6419. Verificar la conversión `new Date(raw.replace(' ','T'))` sobre cadenas ISO sin componente de hora local.

---

*Informe de auditoría técnica completado de conformidad con las directivas de solo lectura y las especificaciones del sistema fintrack.*
