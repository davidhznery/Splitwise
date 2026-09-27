document.addEventListener('DOMContentLoaded', () => {
    let people = JSON.parse(localStorage.getItem('people')) || [];
    let expenses = JSON.parse(localStorage.getItem('expenses')) || [];
    let payments = JSON.parse(localStorage.getItem('payments')) || [];

    // Ensure backwards compatibility by adding IDs if missing
    expenses.forEach((e, i) => { if (!e.id) e.id = 'e_' + Date.now() + '_' + i; });
    payments.forEach((p, i) => { if (!p.id) p.id = 'p_' + Date.now() + '_' + i; });

    const personNameInput = document.getElementById('personName');
    const addPersonButton = document.getElementById('addPerson');
    const peopleList = document.getElementById('peopleList');
    const payerSelect = document.getElementById('payer');
    const expenseAmountInput = document.getElementById('expenseAmount');
    const expenseDescriptionInput = document.getElementById('expenseDescription');
    const splitOptions = document.getElementById('splitOptions');
    const participantsContainer = document.getElementById('expenseParticipants');
    const participantCount = document.getElementById('participantCount');
    const selectAllParticipantsButton = document.getElementById('selectAllParticipants');
    const clearParticipantsButton = document.getElementById('clearParticipants');
    const customSplitContainer = document.getElementById('customSplit');
    const addExpenseButton = document.getElementById('addExpense');
    const balancesList = document.getElementById('balancesList');
    const debtsList = document.getElementById('debtsList');
    const settlementCount = document.getElementById('settlementCount');
    const payerPaymentSelect = document.getElementById('payerPayment');
    const receiverPaymentSelect = document.getElementById('receiverPayment');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentDescriptionInput = document.getElementById('paymentDescription');
    const addPaymentButton = document.getElementById('addPayment');
    const totalSpentElement = document.getElementById('totalSpent');

    let editingExpenseId = null;
    let selectedParticipants = new Set(people);
    let participantsTouched = false;
    let sharedMode = false;
    let hasSharedState = false;
    let canEdit = false;
    let ownerPassword = sessionStorage.getItem('splitwise-owner-password') || '';
    const syncStatus = document.getElementById('syncStatus');
    const resetMonthButton = document.getElementById('resetMonth');

    debtsList.addEventListener('click', event => {
        const button = event.target.closest('.record-suggested-payment');
        if (!button || (sharedMode && !canEdit)) return;

        payments.push({
            id: generateId(),
            amount: Number(button.dataset.amount),
            payer: button.dataset.from,
            receiver: button.dataset.to,
            description: 'Suggested settlement',
        });
        saveData();
        updateAll();
    });

    function setStatus(message) {
        syncStatus.textContent = message;
    }

    function currentState() {
        return { people, expenses, payments };
    }

    async function writeSharedState(action = 'save', state = currentState(), password = ownerPassword) {
        const response = await fetch('/api/balance', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-owner-password': password },
            body: JSON.stringify({ state, action }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not save shared balance.');
    }

    document.getElementById('shareLink').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(location.href.split('#')[0]);
            setStatus('Share link copied.');
        } catch (_) {
            window.prompt('Copy this link to share the balance:', location.href.split('#')[0]);
        }
    });

    document.getElementById('ownerAccess').addEventListener('click', async () => {
        const password = window.prompt('Enter the owner password to edit this shared balance:');
        if (!password) return;
        try {
            await writeSharedState(hasSharedState ? 'verify' : 'save', currentState(), password);
            ownerPassword = password;
            hasSharedState = true;
            sessionStorage.setItem('splitwise-owner-password', password);
            canEdit = true;
            document.body.classList.remove('read-only');
            resetMonthButton.hidden = false;
            document.getElementById('ownerAccess').innerHTML = '<i class="fas fa-unlock"></i> Owner access enabled';
            setStatus('Shared balance ready to edit.');
        } catch (error) {
            setStatus(error.message);
            alert(error.message);
        }
    });

    resetMonthButton.addEventListener('click', async () => {
        if (!confirm('Archive this month and clear expenses and payments? The people list will be kept.')) return;
        const freshState = { people, expenses: [], payments: [] };
        try {
            await writeSharedState('reset', freshState);
            expenses = [];
            payments = [];
            saveData();
            updateAll();
            setStatus('Previous month archived. New month started.');
        } catch (error) {
            setStatus(error.message);
            alert(error.message);
        }
    });

    async function loadSharedState() {
        try {
            const response = await fetch('/api/balance', { cache: 'no-store' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Shared storage unavailable.');
            sharedMode = true;
            if (result.state) {
                hasSharedState = true;
                people = Array.isArray(result.state.people) ? result.state.people : [];
                expenses = Array.isArray(result.state.expenses) ? result.state.expenses : [];
                payments = Array.isArray(result.state.payments) ? result.state.payments : [];
                saveLocalData();
                updateAll();
                setStatus('Showing the shared balance.');
            } else {
                setStatus('No shared balance yet. Owner access will publish this device’s data.');
            }
            document.body.classList.add('read-only');
            if (ownerPassword) {
                try {
                    await writeSharedState(hasSharedState ? 'verify' : 'save');
                    hasSharedState = true;
                    canEdit = true;
                    document.body.classList.remove('read-only');
                    resetMonthButton.hidden = false;
                    setStatus('Shared balance ready to edit.');
                } catch (_) {
                    ownerPassword = '';
                    sessionStorage.removeItem('splitwise-owner-password');
                }
            }
            if (!canEdit) setStatus(result.state ? 'Shared, read-only view.' : 'No shared balance yet. Owner access will publish this device’s data.');
        } catch (error) {
            sharedMode = false;
            document.body.classList.remove('read-only');
            setStatus('Local mode: changes stay on this device.');
            console.warn('Shared balance unavailable:', error.message);
        }
    }

    function generateId() {
        return Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    addPersonButton.addEventListener('click', () => {
        if (sharedMode && !canEdit) return;
        const name = personNameInput.value.trim();
        if (name && !people.includes(name)) {
            people.push(name);
            if (!participantsTouched) selectedParticipants.add(name);
            saveData();
            updateAll();
            personNameInput.value = '';
        }
    });

    function getSelectedParticipants() {
        return people.filter(person => selectedParticipants.has(person));
    }

    function updateParticipantCount() {
        const selectedCount = getSelectedParticipants().length;
        participantCount.textContent = `${selectedCount} of ${people.length} selected`;
        selectAllParticipantsButton.disabled = selectedCount === people.length;
        clearParticipantsButton.disabled = selectedCount === 0;
    }

    function renderParticipantSelector() {
        participantsContainer.innerHTML = '';
        people.forEach(person => {
            const label = document.createElement('label');
            label.className = 'participant-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selectedParticipants.has(person);
            checkbox.dataset.person = person;
            const name = document.createElement('span');
            name.textContent = person;
            label.append(checkbox, name);
            participantsContainer.appendChild(label);
        });
        updateParticipantCount();
    }

    function renderCustomSplit(existingAmounts = null) {
        customSplitContainer.innerHTML = '';
        const participants = getSelectedParticipants();
        const helper = document.createElement('p');
        helper.className = 'custom-split-help';
        helper.textContent = participants.length > 1
            ? 'Enter each share; the last person automatically gets the remaining amount.'
            : 'The selected person will be assigned the full amount.';
        customSplitContainer.appendChild(helper);

        participants.forEach((person, index) => {
            const row = document.createElement('label');
            row.className = 'custom-split-row';
            const name = document.createElement('span');
            name.className = 'custom-split-name';
            name.textContent = person;

            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.min = '0';
            input.inputMode = 'decimal';
            input.placeholder = '0.00';
            input.dataset.person = person;
            input.setAttribute('aria-label', `Share for ${person}`);
            const isRemainder = index === participants.length - 1;
            if (isRemainder) {
                input.readOnly = true;
                input.classList.add('auto-split-amount');
                input.title = 'Automatically calculated from the remaining amount';
                const badge = document.createElement('span');
                badge.className = 'auto-split-badge';
                badge.textContent = 'Auto';
                row.append(name, input, badge);
            } else {
                if (existingAmounts && existingAmounts[person] !== undefined) {
                    input.value = existingAmounts[person];
                }
                row.append(name, input);
            }
            customSplitContainer.appendChild(row);
        });

        const summary = document.createElement('p');
        summary.className = 'custom-split-summary';
        summary.setAttribute('aria-live', 'polite');
        customSplitContainer.appendChild(summary);
        updateCustomSplitRemainder();
        customSplitContainer.style.display = participants.length ? 'block' : 'none';
    }

    function updateCustomSplitRemainder() {
        const inputs = [...customSplitContainer.querySelectorAll('input[data-person]')];
        if (!inputs.length) return;

        const total = Number.parseFloat(expenseAmountInput.value);
        const summary = customSplitContainer.querySelector('.custom-split-summary');
        const finalInput = inputs[inputs.length - 1];
        const enteredCents = inputs.slice(0, -1).reduce((sum, input) => {
            const value = Number.parseFloat(input.value);
            return sum + (Number.isFinite(value) ? Math.round(value * 100) : 0);
        }, 0);

        if (!Number.isFinite(total) || total < 0) {
            finalInput.value = '';
            summary.textContent = 'Enter the total to calculate the last share.';
            summary.classList.remove('is-over-limit');
            return;
        }

        const remainingCents = Math.round(total * 100) - enteredCents;
        finalInput.value = (Math.max(0, remainingCents) / 100).toFixed(2);
        if (remainingCents < 0) {
            summary.textContent = `Entered amount is $${(Math.abs(remainingCents) / 100).toFixed(2)} over the total.`;
            summary.classList.add('is-over-limit');
        } else {
            const enteredLabel = inputs.length > 1
                ? `$${(enteredCents / 100).toFixed(2)} entered`
                : 'No amount entered';
            summary.textContent = `${enteredLabel} · $${(remainingCents / 100).toFixed(2)} remaining for ${finalInput.dataset.person}.`;
            summary.classList.remove('is-over-limit');
        }
    }

    function getCustomSplitValues() {
        return Object.fromEntries(
            [...customSplitContainer.querySelectorAll('input')]
                .map(input => [input.dataset.person, input.value])
        );
    }

    participantsContainer.addEventListener('change', event => {
        const checkbox = event.target.closest('input[type="checkbox"][data-person]');
        if (!checkbox) return;
        const existingAmounts = getCustomSplitValues();
        if (checkbox.checked) selectedParticipants.add(checkbox.dataset.person);
        else selectedParticipants.delete(checkbox.dataset.person);
        participantsTouched = true;
        updateParticipantCount();
        if (document.querySelector('input[name="splitType"]:checked').value === 'custom') {
            renderCustomSplit(existingAmounts);
        }
    });

    customSplitContainer.addEventListener('input', event => {
        if (event.target.matches('input[data-person]:not([readonly])')) updateCustomSplitRemainder();
    });

    expenseAmountInput.addEventListener('input', () => {
        if (document.querySelector('input[name="splitType"]:checked').value === 'custom') {
            updateCustomSplitRemainder();
        }
    });

    selectAllParticipantsButton.addEventListener('click', () => {
        const existingAmounts = getCustomSplitValues();
        selectedParticipants = new Set(people);
        participantsTouched = true;
        renderParticipantSelector();
        if (document.querySelector('input[name="splitType"]:checked').value === 'custom') renderCustomSplit(existingAmounts);
    });

    clearParticipantsButton.addEventListener('click', () => {
        selectedParticipants.clear();
        participantsTouched = true;
        renderParticipantSelector();
        customSplitContainer.innerHTML = '';
        customSplitContainer.style.display = 'none';
    });

    splitOptions.addEventListener('change', () => {
        if (document.querySelector('input[name="splitType"]:checked').value === 'custom') {
            renderCustomSplit();
        } else {
            customSplitContainer.style.display = 'none';
        }
    });

    function resetExpenseForm() {
        expenseAmountInput.value = '';
        expenseDescriptionInput.value = '';
        payerSelect.value = '';
        selectedParticipants = new Set(people);
        participantsTouched = false;
        renderParticipantSelector();
        document.querySelector('input[name="splitType"][value="equal"]').checked = true;
        customSplitContainer.innerHTML = '';
        customSplitContainer.style.display = 'none';
        editingExpenseId = null;
        addExpenseButton.innerHTML = '<i class="fas fa-plus-circle"></i> Add Expense';
    }

    addExpenseButton.addEventListener('click', () => {
        if (sharedMode && !canEdit) return;
        const enteredAmount = parseFloat(expenseAmountInput.value);
        const amount = Number.isFinite(enteredAmount) ? Math.round(enteredAmount * 100) / 100 : 0;
        const payer = payerSelect.value;
        const description = expenseDescriptionInput.value.trim();
        if (amount > 0 && payer) {
            const participants = getSelectedParticipants();
            if (participants.length === 0) {
                alert('Select at least one person to share this expense.');
                return;
            }
            const splitType = document.querySelector('input[name="splitType"]:checked').value;
            let splitAmounts = {};

            if (splitType === 'equal') {
                const totalCents = Math.round(amount * 100);
                const baseShare = Math.floor(totalCents / participants.length);
                participants.forEach(person => {
                    splitAmounts[person] = baseShare / 100;
                });
                const finalPerson = participants[participants.length - 1];
                splitAmounts[finalPerson] = (totalCents - baseShare * (participants.length - 1)) / 100;
            } else {
                const hasNegativeShare = [...customSplitContainer.querySelectorAll('input:not([readonly])')]
                    .some(input => Number.parseFloat(input.value) < 0);
                if (hasNegativeShare) {
                    alert('Shares cannot be negative.');
                    return;
                }
                customSplitContainer.querySelectorAll('input').forEach(input => {
                    const person = input.dataset.person;
                    const enteredShare = parseFloat(input.value);
                    const personAmount = Number.isFinite(enteredShare)
                        ? Math.round(enteredShare * 100) / 100
                        : 0;
                    splitAmounts[person] = personAmount;
                });
            }

            const totalSplitCents = Object.values(splitAmounts)
                .reduce((total, value) => total + Math.round(value * 100), 0);
            if (totalSplitCents !== Math.round(amount * 100)) {
                alert('The shares must add up to the total. Check the amounts entered.');
                return;
            }

            if (editingExpenseId) {
                const idx = expenses.findIndex(e => e.id === editingExpenseId);
                if (idx !== -1) {
                    expenses[idx] = { id: editingExpenseId, amount, payer, splitAmounts, participants, description };
                }
            } else {
                expenses.push({ id: generateId(), amount, payer, splitAmounts, participants, description });
            }

            saveData();
            updateAll();
            resetExpenseForm();
        }
    });

    addPaymentButton.addEventListener('click', () => {
        if (sharedMode && !canEdit) return;
        const amount = parseFloat(paymentAmountInput.value);
        const payer = payerPaymentSelect.value;
        const receiver = receiverPaymentSelect.value;
        const description = paymentDescriptionInput.value.trim();
        if (amount > 0 && payer && receiver && payer !== receiver) {
            payments.push({ id: generateId(), amount, payer, receiver, description });
            saveData();
            updateAll();
            paymentAmountInput.value = '';
            paymentDescriptionInput.value = '';
        }
    });

    peopleList.addEventListener('click', (event) => {
        if (sharedMode && !canEdit) return;
        if (event.target.closest('.edit-person')) {
            const btn = event.target.closest('.edit-person');
            const personName = btn.dataset.person;
            const newName = prompt('Enter new name:', personName);
            if (newName && newName.trim() !== '' && newName !== personName && !people.includes(newName)) {
                const index = people.indexOf(personName);
                people[index] = newName;
                if (selectedParticipants.has(personName)) {
                    selectedParticipants.delete(personName);
                    selectedParticipants.add(newName);
                }
                expenses.forEach(e => {
                    if (e.payer === personName) e.payer = newName;
                    if (e.splitAmounts[personName] !== undefined) {
                        e.splitAmounts[newName] = e.splitAmounts[personName];
                        delete e.splitAmounts[personName];
                    }
                    if (Array.isArray(e.participants)) {
                        e.participants = e.participants.map(person => person === personName ? newName : person);
                    }
                });
                payments.forEach(p => {
                    if (p.payer === personName) p.payer = newName;
                    if (p.receiver === personName) p.receiver = newName;
                });
                saveData();
                updateAll();
            }
        }
        if (event.target.closest('.delete-person')) {
            const btn = event.target.closest('.delete-person');
            const personName = btn.dataset.person;
            if (!confirm(`Are you sure you want to delete ${personName}? This will remove them from all expenses and payments.`)) return;
            const index = people.indexOf(personName);
            people.splice(index, 1);
            selectedParticipants.delete(personName);

            expenses = expenses.filter(e => e.payer !== personName);
            expenses.forEach(e => {
                delete e.splitAmounts[personName];
                if (Array.isArray(e.participants)) {
                    e.participants = e.participants.filter(person => person !== personName);
                }
            });
            payments = payments.filter(p => p.payer !== personName && p.receiver !== personName);

            saveData();
            updateAll();
        }
    });

    balancesList.addEventListener('click', (event) => {
        if (sharedMode && !canEdit) return;
        if (event.target.closest('.delete-expense')) {
            if (!confirm("Are you sure you want to delete this expense?")) return;
            const id = event.target.closest('.delete-expense').dataset.id;
            expenses = expenses.filter(e => e.id !== id);
            saveData();
            updateAll();
        }
        if (event.target.closest('.edit-expense')) {
            const id = event.target.closest('.edit-expense').dataset.id;
            const expense = expenses.find(e => e.id === id);
            if (!expense) return;

            editingExpenseId = expense.id;
            expenseAmountInput.value = expense.amount;
            expenseDescriptionInput.value = expense.description;
            payerSelect.value = expense.payer;

            const expenseParticipants = Array.isArray(expense.participants)
                ? expense.participants
                : Object.entries(expense.splitAmounts)
                    .filter(([, amount]) => amount > 0)
                    .map(([person]) => person);
            selectedParticipants = new Set(expenseParticipants.filter(person => people.includes(person)));
            participantsTouched = true;
            renderParticipantSelector();

            let allEqual = true;
            if (expenseParticipants.length > 0) {
                const eqAmt = expense.amount / expenseParticipants.length;
                for (let person of expenseParticipants) {
                    if (Math.abs((expense.splitAmounts[person] || 0) - eqAmt) > 0.01) {
                        allEqual = false;
                        break;
                    }
                }
            } else {
                allEqual = false;
            }

            if (allEqual && Object.keys(expense.splitAmounts).filter(person => expense.splitAmounts[person] > 0).length === expenseParticipants.length) {
                document.querySelector('input[name="splitType"][value="equal"]').checked = true;
                customSplitContainer.style.display = 'none';
            } else {
                document.querySelector('input[name="splitType"][value="custom"]').checked = true;
                renderCustomSplit(expense.splitAmounts);
            }
            addExpenseButton.innerHTML = '<i class="fas fa-save"></i> Save Changes';
            addExpenseButton.scrollIntoView({ behavior: 'smooth' });
        }
        if (event.target.closest('.delete-payment')) {
            if (!confirm("Are you sure you want to delete this payment?")) return;
            const id = event.target.closest('.delete-payment').dataset.id;
            payments = payments.filter(p => p.id !== id);
            saveData();
            updateAll();
        }
    });

    function updatePeopleList() {
        peopleList.innerHTML = '';
        people.forEach(person => {
            const li = document.createElement('li');
            li.innerHTML = `${person} 
                <div class="actions">
                    <button class="edit-person btn-icon" data-person="${person}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="delete-person btn-icon" data-person="${person}" title="Delete"><i class="fas fa-trash-alt"></i></button>
                </div>`;
            peopleList.appendChild(li);
        });
    }

    function updatePayerSelect() {
        const currentPayer = payerSelect.value;
        const currentPayerPayment = payerPaymentSelect.value;
        const currentReceiverPayment = receiverPaymentSelect.value;

        payerSelect.innerHTML = '<option value="">Select payer</option>';
        payerPaymentSelect.innerHTML = '<option value="">Select payer</option>';
        receiverPaymentSelect.innerHTML = '<option value="">Select receiver</option>';

        people.forEach(person => {
            const option = document.createElement('option');
            option.value = person;
            option.textContent = person;
            payerSelect.appendChild(option);
            payerPaymentSelect.appendChild(option.cloneNode(true));
            receiverPaymentSelect.appendChild(option.cloneNode(true));
        });

        if (people.includes(currentPayer)) payerSelect.value = currentPayer;
        if (people.includes(currentPayerPayment)) payerPaymentSelect.value = currentPayerPayment;
        if (people.includes(currentReceiverPayment)) receiverPaymentSelect.value = currentReceiverPayment;
    }

    function calculateNetBalances() {
        const netBalances = {};
        people.forEach(p => netBalances[p] = 0);

        expenses.forEach(expense => {
            if (netBalances[expense.payer] !== undefined) {
                netBalances[expense.payer] += expense.amount;
            }
            for (const [person, amount] of Object.entries(expense.splitAmounts)) {
                if (netBalances[person] !== undefined) {
                    netBalances[person] -= amount;
                }
            }
        });

        payments.forEach(payment => {
            if (netBalances[payment.payer] !== undefined) netBalances[payment.payer] += payment.amount;
            if (netBalances[payment.receiver] !== undefined) netBalances[payment.receiver] -= payment.amount;
        });

        return netBalances;
    }

    function updateBalancesList(netBalances) {
        balancesList.innerHTML = '';

        if (expenses.length === 0 && payments.length === 0) {
            balancesList.innerHTML = '<li class="empty-state">No timeline events yet. Add an expense to get started.</li>';
        }

        expenses.forEach((expense) => {
            const li = document.createElement('li');
            li.classList.add('timeline-item');
            const includedPeople = Object.entries(expense.splitAmounts)
                .filter(([_, amt]) => amt > 0)
                .map(([p, _]) => p)
                .join(', ');

            li.innerHTML = `
                <div class="timeline-details">
                    <strong>${expense.description}</strong><br>
                    <small>${expense.payer} paid $${expense.amount.toFixed(2)}</small><br>
                    <small class="split-info">Split between: ${includedPeople}</small>
                </div>
                <div class="timeline-actions">
                    <button class="edit-expense btn-icon" data-id="${expense.id}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="delete-expense btn-icon" data-id="${expense.id}" title="Delete"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            balancesList.appendChild(li);
        });

        payments.forEach((payment) => {
            const li = document.createElement('li');
            li.classList.add('timeline-item');
            li.innerHTML = `
                <div class="timeline-details">
                    <strong>${payment.description || 'Payment'}</strong><br>
                    <small>${payment.payer} paid $${payment.amount.toFixed(2)} to ${payment.receiver}</small>
                </div>
                <div class="timeline-actions">
                    <button class="delete-payment btn-icon" data-id="${payment.id}" title="Delete"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            balancesList.appendChild(li);
        });

        const totalBalances = document.createElement('li');
        totalBalances.className = 'summary-header';
        totalBalances.innerHTML = '<h3>Net Balances</h3>';
        balancesList.appendChild(totalBalances);

        let hasBalances = false;
        Object.keys(netBalances).forEach(person => {
            const balance = netBalances[person];
            if (Math.abs(balance) > 0.01) {
                hasBalances = true;
                const li = document.createElement('li');
                li.className = balance > 0 ? 'balance-positive' : 'balance-negative';
                li.innerHTML = `<span><i class="fas ${balance > 0 ? 'fa-arrow-left' : 'fa-arrow-right'}"></i> &nbsp; ${person}</span> <span>${balance > 0 ? 'gets back' : 'owes'} $${Math.abs(balance).toFixed(2)}</span>`;
                balancesList.appendChild(li);
            }
        });
        if (!hasBalances && people.length > 0) {
            const li = document.createElement('li');
            li.innerHTML = `<em style="color: var(--text-secondary);">All balances are settled.</em>`;
            balancesList.appendChild(li);
        }
    }

    function calculateSimplifiedDebts(netBalances) {
        const debtors = [];
        const creditors = [];

        for (const [person, balance] of Object.entries(netBalances)) {
            const amountInCents = Math.round(Math.abs(balance) * 100);
            if (amountInCents === 0) continue;
            if (balance < 0) debtors.push({ person, amount: amountInCents });
            else creditors.push({ person, amount: amountInCents });
        }

        debtors.sort((a, b) => b.amount - a.amount);
        creditors.sort((a, b) => b.amount - a.amount);

        const transactions = [];
        let i = 0, j = 0;

        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];

            const amount = Math.min(debtor.amount, creditor.amount);

            if (amount > 0) {
                transactions.push({ from: debtor.person, to: creditor.person, amount: amount / 100 });
            }

            debtor.amount -= amount;
            creditor.amount -= amount;

            if (Math.abs(debtor.amount) < 0.01) i++;
            if (Math.abs(creditor.amount) < 0.01) j++;
        }

        return transactions;
    }

    function updateDebtsList(netBalances) {
        const debts = calculateSimplifiedDebts(netBalances);
        debtsList.innerHTML = '';
        settlementCount.textContent = debts.length === 1
            ? '1 payment needed'
            : `${debts.length} payments needed`;

        if (debts.length === 0) {
            debtsList.innerHTML = '<li class="empty-state">Everyone is settled up.</li>';
            return;
        }

        debts.forEach(debt => {
            const li = document.createElement('li');
            li.className = 'suggested-payment';
            const details = document.createElement('span');
            details.className = 'suggested-payment-details';
            const names = document.createElement('span');
            names.append(document.createTextNode(`${debt.from} pays `));
            const recipient = document.createElement('strong');
            recipient.textContent = debt.to;
            names.appendChild(recipient);
            const amount = document.createElement('strong');
            amount.className = 'suggested-payment-amount';
            amount.textContent = `$${debt.amount.toFixed(2)}`;
            details.append(names, amount);

            const recordButton = document.createElement('button');
            recordButton.type = 'button';
            recordButton.className = 'btn-secondary record-suggested-payment';
            recordButton.dataset.from = debt.from;
            recordButton.dataset.to = debt.to;
            recordButton.dataset.amount = debt.amount.toFixed(2);
            recordButton.innerHTML = '<i class="fas fa-check"></i> Record payment';
            recordButton.disabled = sharedMode && !canEdit;
            li.append(details, recordButton);
            debtsList.appendChild(li);
        });
    }

    function updateTotalSpent() {
        const totalSpent = expenses.reduce((total, expense) => total + expense.amount, 0);
        totalSpentElement.textContent = `$${totalSpent.toFixed(2)}`;
    }

    function saveLocalData() {
        localStorage.setItem('people', JSON.stringify(people));
        localStorage.setItem('expenses', JSON.stringify(expenses));
        localStorage.setItem('payments', JSON.stringify(payments));
    }

    function saveData() {
        saveLocalData();
        if (sharedMode && canEdit) {
            setStatus('Saving shared balance…');
            writeSharedState().then(() => setStatus('Shared balance saved.')).catch(error => {
                setStatus(error.message);
                alert(error.message);
            });
        }
    }

    function updateAll() {
        const existingAmounts = getCustomSplitValues();
        updatePeopleList();
        updatePayerSelect();
        renderParticipantSelector();
        if (customSplitContainer.style.display === 'block') renderCustomSplit(existingAmounts);
        const netBalances = calculateNetBalances();
        updateBalancesList(netBalances);
        updateDebtsList(netBalances);
        updateTotalSpent();
    }

    // Initial render
    updateAll();
    loadSharedState();
});
