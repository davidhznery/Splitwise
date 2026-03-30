document.addEventListener('DOMContentLoaded', () => {
    const people = JSON.parse(localStorage.getItem('people')) || [];
    const balances = JSON.parse(localStorage.getItem('balances')) || {};
    const expenses = JSON.parse(localStorage.getItem('expenses')) || [];
    const payments = JSON.parse(localStorage.getItem('payments')) || [];

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

    addPersonButton.addEventListener('click', () => {
        const name = personNameInput.value.trim();
        if (name && !people.includes(name)) {
            people.push(name);
            balances[name] = 0;
            saveData();
            updatePeopleList();
            updatePayerSelect();
            personNameInput.value = '';
        }
    });

    splitOptions.addEventListener('change', () => {
        if (document.querySelector('input[name="splitType"]:checked').value === 'custom') {
            customSplitContainer.innerHTML = '';
            people.forEach(person => {
                const input = document.createElement('input');
                input.type = 'number';
                input.placeholder = `Amount for ${person}`;
                input.dataset.person = person;
                customSplitContainer.appendChild(input);
            });
            customSplitContainer.style.display = 'block';
        } else {
            customSplitContainer.style.display = 'none';
        }
    });

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
            if (totalSplit !== amount) {
                alert('Split amounts do not add up to the total expense amount.');
                return;
            }

            people.forEach(person => {
                if (person !== payer) {
                    balances[payer] += splitAmounts[person];
                    balances[person] -= splitAmounts[person];
                }
            });
            expenses.push({ amount, payer, splitAmounts, description });
            saveData();
            updateBalancesList();
            updateDebtsList();
            updateTotalSpent();
            expenseAmountInput.value = '';
            expenseDescriptionInput.value = '';
            customSplitContainer.innerHTML = '';
            customSplitContainer.style.display = 'none';
        }
    });

    addPaymentButton.addEventListener('click', () => {
        const amount = parseFloat(paymentAmountInput.value);
        const payer = payerPaymentSelect.value;
        const receiver = receiverPaymentSelect.value;
        const description = paymentDescriptionInput.value.trim();
        if (amount > 0 && payer && receiver && payer !== receiver) {
            balances[payer] -= amount;
            balances[receiver] += amount;
            payments.push({ amount, payer, receiver, description });
            saveData();
            updateBalancesList();
            updateDebtsList();
            updateTotalSpent();
            paymentAmountInput.value = '';
            paymentDescriptionInput.value = '';
        }
    });

    peopleList.addEventListener('click', (event) => {
        if (event.target.classList.contains('edit-person')) {
            const personName = event.target.dataset.person;
            const newName = prompt('Enter new name:', personName);
            if (newName && !people.includes(newName)) {
                const index = people.indexOf(personName);
                people[index] = newName;
                balances[newName] = balances[personName];
                delete balances[personName];
                saveData();
                updatePeopleList();
                updatePayerSelect();
                updateBalancesList();
                updateDebtsList();
                updateTotalSpent();
            }
        }
        if (event.target.classList.contains('delete-person')) {
            const personName = event.target.dataset.person;
            const index = people.indexOf(personName);
            people.splice(index, 1);
            delete balances[personName];
            saveData();
            updatePeopleList();
            updatePayerSelect();
            updateBalancesList();
            updateDebtsList();
            updateTotalSpent();
        }
    });

    balancesList.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-expense')) {
            const index = event.target.dataset.index;
            const expense = expenses[index];

            people.forEach(person => {
                if (person !== expense.payer) {
                    balances[expense.payer] -= expense.splitAmounts[person];
                    balances[person] += expense.splitAmounts[person];
                }
            });

            expenses.splice(index, 1);
            saveData();
            updateBalancesList();
            updateDebtsList();
            updateTotalSpent();
        }
        if (event.target.classList.contains('delete-payment')) {
            const index = event.target.dataset.index;
            const payment = payments[index];

            balances[payment.payer] += payment.amount;
            balances[payment.receiver] -= payment.amount;

            payments.splice(index, 1);
            saveData();
            updateBalancesList();
            updateDebtsList();
            updateTotalSpent();
        }
    });

    function updatePeopleList() {
        peopleList.innerHTML = '';
        people.forEach(person => {
            const li = document.createElement('li');
            li.innerHTML = `${person} 
                <button class="edit-person" data-person="${person}"><i class="fas fa-edit"></i> Edit</button>
                <button class="delete-person" data-person="${person}"><i class="fas fa-trash-alt"></i> Delete</button>`;
            peopleList.appendChild(li);
        });
    }

    function updatePayerSelect() {
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
    }

    function updateBalancesList() {
        balancesList.innerHTML = '';
        expenses.forEach((expense, index) => {
            const li = document.createElement('li');
            li.innerHTML = `${expense.payer} paid ${expense.amount} for ${expense.description}. 
                <button class="delete-expense" data-index="${index}"><i class="fas fa-trash-alt"></i> Delete</button>`;
            balancesList.appendChild(li);
        });

        payments.forEach((payment, index) => {
            const li = document.createElement('li');
            li.innerHTML = `${payment.payer} paid ${payment.amount} to ${payment.receiver} for ${payment.description}. 
                <button class="delete-payment" data-index="${index}"><i class="fas fa-trash-alt"></i> Delete</button>`;
            balancesList.appendChild(li);
        });

        const totalBalances = document.createElement('li');
        totalBalances.innerHTML = '<h3>Total Balances</h3>';
        balancesList.appendChild(totalBalances);

        Object.keys(balances).forEach(person => {
            const balance = balances[person];
            const li = document.createElement('li');
            li.textContent = `${person} balance: ${balance.toFixed(2)}`;
            balancesList.appendChild(li);
        });
    }

    function updateDebtsList() {
        const debts = calculateDebts();
        debtsList.innerHTML = '';
        Object.keys(debts).forEach(debtor => {
            Object.keys(debts[debtor]).forEach(creditor => {
                const amount = debts[debtor][creditor];
                const li = document.createElement('li');
                li.textContent = `${debtor} owes ${creditor}: ${amount.toFixed(2)}`;
                debtsList.appendChild(li);
            });
        });
    }

    function updateTotalSpent() {
        const totalSpent = expenses.reduce((total, expense) => total + expense.amount, 0);
        totalSpentElement.textContent = `$${totalSpent.toFixed(2)}`;
    }

    function calculateDebts() {
        const debts = {};
        people.forEach(person => {
            debts[person] = {};
            people.forEach(other => {
                if (person !== other) {
                    debts[person][other] = 0;
                }
            });
        });

        expenses.forEach(expense => {
            Object.keys(expense.splitAmounts).forEach(person => {
                if (person !== expense.payer) {
                    debts[person][expense.payer] += expense.splitAmounts[person];
                }
            });
        });

        payments.forEach(payment => {
            debts[payment.payer][payment.receiver] -= payment.amount;
        });

        return debts;
    }

    function saveData() {
        localStorage.setItem('people', JSON.stringify(people));
        localStorage.setItem('balances', JSON.stringify(balances));
        localStorage.setItem('expenses', JSON.stringify(expenses));
        localStorage.setItem('payments', JSON.stringify(payments));
    }

    updatePeopleList();
    updatePayerSelect();
    updateBalancesList();
    updateDebtsList();
    updateTotalSpent();
});
