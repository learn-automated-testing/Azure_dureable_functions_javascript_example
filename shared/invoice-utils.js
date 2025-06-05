const validateAmount = (amount) => {
    return amount > 0 && amount <= 1000000;
};

const validateDate = (date) => {
    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj);
};

const calculateTotal = (lineItems) => {
    return lineItems.reduce((sum, item) => sum + item.total, 0);
};

const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
};

module.exports = {
    validateAmount,
    validateDate,
    calculateTotal,
    formatCurrency
}; 