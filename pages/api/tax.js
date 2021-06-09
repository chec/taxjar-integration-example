import { TaxjarError } from 'taxjar/dist/util/types';

const { commerce } = require('../../lib/commerce');
const Taxjar = require('taxjar');

// Instantiate TaxJar client
const taxjarClient = new Taxjar({
  apiKey: process.env.TAXJAR_API_KEY
});

export default async function handler(req, res) {
  const { token, country, region, zip } = req.query;

  // Ensure that the checkout token or country is provided
  if (!token || !country) {
    return res.status(422).json({
      code: 'MISSING_ATTRIBUTES',
      message: 'A checkout token, destination country, and shipping price must be provided.',
    });
  }

  // Define array to push results of live object and merchant to
  const promises = [];
  promises.push(commerce.checkout.getLive(token));
  // Request merchant data using secret key so that the
  // address gets returned in the merchant object
  promises.push(fetch(`${process.env.CHEC_API_URL}/v1/merchants`, {
    headers: {
      'X-Authorization': process.env.CHEC_SECRET_KEY,
    },
  }).then((response) => response.json()));

  // Resolve promises in checkout and merchant
  const [checkout, merchant] = await Promise.all(promises);

  // Destructure out required merchant info
  const {
    country: fromCountry,
    postal_zip_code: fromZip,
  } = merchant.address;

  // Destructure line items and shipping price from the live object
  const {
    line_items: lineItems,
    shipping: { price: { raw: shippingPrice } }
  } = checkout;

  // Build TaxJar request schema with attributes might be
  // required based on the tax regions or other custom
  // requirements like Nexus on the merchant
  const buildTaxJarRequest = () => {
    const requestPayload = {
      from_country: fromCountry, // Required if no Nexus addresses
      // TO-DO: Change from hard coded state code to region after
      // merchant supports ISO code for regions
      from_state: 'NY', // Required if no Nexus addresses
      from_zip: fromZip, // Required if no Nexus addresses
      to_country: country, // Required
      to_state: region, // Required when country code is 'US' or 'CA'
      to_zip: zip,
      line_items: [], // Required
      shipping: shippingPrice, // Required
    }

    // Loop line items from the checkout live object
    lineItems.forEach((item) => {
      const taxItem = {
        id: item.id,
        quantity: item.quantity,
        unit_price: item.price.raw,
      };
      requestPayload.line_items.push(taxItem);
    });

    return requestPayload;
  }

  // Declare TaxJar response to store result of TaxJar API call
  let taxJarResponse;

  try {
    // Call TaxJar's calculate sales tax API endpoint
    // https://developers.taxjar.com/api/reference/?javascript#taxes
    const taxJarRequest = buildTaxJarRequest();
    taxJarResponse = await taxjarClient.taxForOrder(taxJarRequest);
  } catch (err) {
    // Catch any errors and return error message
    // from the error object detail key
    // return res.status(400).json(err.detail);
    return res.status(400).json({
      code: 'INVALID_ADDRESS',
      message: err.detail,
    });
  }

  console.log(taxJarResponse);
  console.log('Taxjar resp line items', taxJarResponse.tax.breakdown.line_items);

  // Structure out the tax object we need to send to the
  // Update Checkout API request body
  const requestBody = {
    tax: {
      provider: 'TaxJar',
      line_items: taxJarResponse.tax.breakdown.line_items.map(
        ({ id, tax_collectable: taxAmount, combined_tax_rate: taxRate }) => ({
        id,
        breakdown: [
          {
            amount: taxAmount,
            rate: taxRate,
            type: 'Tax',
          }
        ],
      }))
    },
  };

  console.log('Server request body', requestBody);

  // Add the calculated custom tax response by TaxJar to
  // the checkout using Chec's Update Checkout API
  const response = await fetch(
    `${process.env.CHEC_API_URL}/v1/checkouts/${token}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Authorization': process.env.CHEC_SECRET_KEY,
      },
      body: JSON.stringify(requestBody)
    })
    .then((response) => {
      if (!response.ok) {
        throw 'Error';
      }
      return response.json();
    });

    console.log('Server response', response.tax);

  return res.status(200).json(response.tax);
}
