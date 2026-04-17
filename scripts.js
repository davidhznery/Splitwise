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
    const customSplitContainer = document.getElementById('customSplit');
    const addExpenseButton = document.getElementById('addExpense');
    const balancesList = document.getElementById('balancesList');
    const debtsList = document.getElementById('debtsList');
    const payerPaymentSelect = document.getElementById('payerPayment');
    const receiverPaymentSelect = document.getElementById('receiverPayment');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentDescriptionInput = document.getElementById('paymentDescription');
    const addPaymentButton = document.getElementById('addPayment');
    const totalSpentElement = document.getElementById('totalSpent');

    let editingExpenseId = null;

    function generateId() {
        return Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    addPersonButton.addEventListener('click', () => {
        const name = personNameInput.value.trim();
        if (name && !people.includes(name)) {
            people.push(name);
            saveData();
            updateAll();
            personNameInput.value = '';
        }
    });

    function renderCustomSplit(existingAmounts = null) {
        customSplitContainer.innerHTML = '';
        people.forEach(person => {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.placeholder = `Amount for ${person}`;
            input.dataset.person = person;
            if (existingAmounts && existingAmounts[person] !== undefined) {
                input.value = existingAmounts[person];
            }
            customSplitContainer.appendChild(input);
        });
        customSplitContainer.style.display = 'block';
    }

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
        document.querySelector('input[name="splitType"][value="equal"]').checked = true;
        customSplitContainer.innerHTML = '';
        customSplitContainer.style.display = 'none';
        editingExpenseId = null;
        addExpenseButton.innerHTML = '<i class="fas fa-plus-circle"></i> Add Expense';
    }

    addExpenseButton.addEventListener('click', () => {
        const amount = parseFloat(expenseAmountInput.value);
        const payer = payerSelect.value;
        const description = expenseDescriptionInput.value.trim();
        if (amount > 0 && payer) {
            const splitType = document.querySelector('input[name="splitType"]:checked').value;
            let splitAmounts = {};

            if (splitType === 'equal') {
                const equalAmount = amount / people.length;
                people.forEach(person => {
                    splitAmounts[person] = equalAmount;
                });
            } else {
                customSplitContainer.querySelectorAll('input').forEach(input => {
                    const person = input.dataset.person;
                    const personAmount = parseFloat(input.value) || 0;
                    splitAmounts[person] = personAmount;
                });
            }

            let totalSplit = 0;
            Object.values(splitAmounts).forEach(value => totalSplit += value);
            if (Math.abs(totalSplit - amount) > 0.01) {
                alert('Split amounts do not add up to the total expense amount.');
                return;
            }

            if (editingExpenseId) {
                const idx = expenses.findIndex(e => e.id === editingExpenseId);
                if (idx !== -1) {
                    expenses[idx] = { id: editingExpenseId, amount, payer, splitAmounts, description };
                }
            } else {
                expenses.push({ id: generateId(), amount, payer, splitAmounts, description });
            }

            saveData();
            updateAll();
            resetExpenseForm();
        }
    });

    addPaymentButton.addEventListener('click', () => {
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
        if (event.target.closest('.edit-person')) {
            const btn = event.target.closest('.edit-person');
            const personName = btn.dataset.person;
            const newName = prompt('Enter new name:', personName);
            if (newName && newName.trim() !== '' && newName !== personName && !people.includes(newName)) {
                const index = people.indexOf(personName);
                people[index] = newName;
                expenses.forEach(e => {
                    if (e.payer === personName) e.payer = newName;
                    if (e.splitAmounts[personName] !== undefined) {
                        e.splitAmounts[newName] = e.splitAmounts[personName];
                        delete e.splitAmounts[personName];
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

            expenses = expenses.filter(e => e.payer !== personName);
            expenses.forEach(e => {
                delete e.splitAmounts[personName];
            });
            payments = payments.filter(p => p.payer !== personName && p.receiver !== personName);

            saveData();
            updateAll();
        }
    });

    balancesList.addEventListener('click', (event) => {
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

            let allEqual = true;
            if (people.length > 0) {
                const eqAmt = expense.amount / people.length;
                for (let person of people) {
                    if (Math.abs((expense.splitAmounts[person] || 0) - eqAmt) > 0.01) {
                        allEqual = false;
                        break;
                    }
                }
            } else {
                allEqual = false;
            }

            if (allEqual && Object.keys(expense.splitAmounts).length === people.length) {
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
            if (balance < -0.01) debtors.push({ person, amount: -balance });
            else if (balance > 0.01) creditors.push({ person, amount: balance });
        }

        debtors.sort((a, b) => b.amount - a.amount);
        creditors.sort((a, b) => b.amount - a.amount);

        const transactions = [];
        let i = 0, j = 0;

        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];

            const amount = Math.min(debtor.amount, creditor.amount);

            const roundedAmount = Math.round(amount * 100) / 100;
            if (roundedAmount > 0) {
                transactions.push({ from: debtor.person, to: creditor.person, amount: roundedAmount });
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

        if (debts.length === 0) {
            debtsList.innerHTML = '<li class="empty-state">No debts to settle up!</li>';
            return;
        }

        debts.forEach(debt => {
            const li = document.createElement('li');
            li.innerHTML = `<span><strong>${debt.from}</strong> owes <strong>${debt.to}</strong></span> <strong>$${debt.amount.toFixed(2)}</strong>`;
            debtsList.appendChild(li);
        });
    }

    function updateTotalSpent() {
        const totalSpent = expenses.reduce((total, expense) => total + expense.amount, 0);
        totalSpentElement.textContent = `$${totalSpent.toFixed(2)}`;
    }

    function saveData() {
        localStorage.setItem('people', JSON.stringify(people));
        localStorage.setItem('expenses', JSON.stringify(expenses));
        localStorage.setItem('payments', JSON.stringify(payments));
    }

    function updateAll() {
        updatePeopleList();
        updatePayerSelect();
        const netBalances = calculateNetBalances();
        updateBalancesList(netBalances);
        updateDebtsList(netBalances);
        updateTotalSpent();
    }

    // Initial render
    updateAll();
});
