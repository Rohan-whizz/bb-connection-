require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Enable CORS so your live GitHub Pages site can talk to this Render server
app.use(cors({
    origin: 'https://rohan-whizz.github.io' // Restricts access to just your live site for safety
}));
app.use(express.json());

// Determine environment dynamically from your Environment Variables
const IS_LIVE = process.env.PESAPAL_ENV === 'live';
const PESAPAL_URL = IS_LIVE 
    ? "https://pay.pesapal.com/v3" 
    : "https://cybqa.pesapal.com/pesapalv3";

const PORT = process.env.PORT || 5000;

// Root route so Render can verify your server is awake
app.get('/', (req, res) => {
    res.send(`Broad Connections Gateway Node is Live (${IS_LIVE ? 'Production' : 'Sandbox Testing'})`);
});

// STEP 1: Generate Access Token from Pesapal
async function getAuthToken() {
    try {
        const response = await axios.post(`${PESAPAL_URL}/api/Auth/RequestToken`, {
            consumer_key: process.env.PESAPAL_CONSUMER_KEY,
            consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
        });
        return response.data.token;
    } catch (error) {
        console.error("Pesapal Authentication Error:", error.response?.data || error.message);
        throw new Error("Failed to authenticate with Pesapal API.");
    }
}

// STEP 2 & 3: Register IPN and Initialize the Payment Checkout URL
app.post('/api/initialize-payment', async (req, res) => {
    const { amount, phone, email, name, referenceId } = req.body;
    
    try {
        const token = await getAuthToken();

        // Dynamically discover your hosted Render domain address
        const domain = req.get('host');
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const ipnUrl = `${protocol}://${domain}/api/pesapal-ipn`;

        // 2. Register IPN (Instant Payment Notification) endpoint with Pesapal
        const ipnRes = await axios.post(`${PESAPAL_URL}/api/URLRegister/RegisterIPN`, {
            url: ipnUrl,
            ipn_notification_type: "GET"
        }, { 
            headers: { Authorization: `Bearer ${token}` } 
        });

        const notificationId = ipnRes.data.notification_id;

        // 3. Construct the official Order Payload
        const orderPayload = {
            id: referenceId,
            currency: "KES",
            amount: amount,
            description: "Account Activation Gateway Node",
            callback_url: "https://rohan-whizz.github.io/bb-connection-/", // Redirects back to your GitHub page after paying
            notification_id: notificationId,
            billing_address: {
                email_address: email || "billing@broadconnections.com",
                phone_number: phone,
                first_name: name,
                last_name: "Customer"
            }
        };

        const orderRes = await axios.post(`${PESAPAL_URL}/api/Transactions/SubmitOrderRequest`, orderPayload, {
            headers: { Authorization: `Bearer ${token}` }
        });

        // Pass the secure checkout link back to your frontend
        res.json({ success: true, redirect_url: orderRes.data.redirect_url });

    } catch (error) {
        console.error("Payment Initialization Failed:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Payment gateway initialization failed." });
    }
});

// STEP 4: Webhook Callback Handler (Pesapal pings this automatically when payment status updates)
app.get('/api/pesapal-ipn', async (req, res) => {
    const { OrderTrackingId, OrderMerchantReference } = req.query;
    console.log(`IPN Ping Received! Tracking ID: ${OrderTrackingId}, Reference: ${OrderMerchantReference}`);
    
    // Future database status update operations go here!
    
    res.status(200).send("OK");
});

app.listen(PORT, () => console.log(`Secure Gateway Node live on port ${PORT}`));