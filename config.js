// ФАЙЛ КОНФИГУРАЦИИ

const APP_CONFIG = {
    // Ссылка на канал оплаты
    paymentUrl: "https://t.me/donate_gid",

    // Уведомления админу (когда пользователь нажимает на закрытый день)
    telegram: {
        enabled: true,              // true = Включить уведомления
        botToken: "6976526427:AAGfQqO6j0XvePdgJ3YkRyVJjEriSzl5H90", // Токен бота от @BotFather
        chatId: "1760136325"       // Ваш ID (куда присылать уведомления)
    }
};
