import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useDebounce } from 'use-debounce';
import { commerce } from "../../lib/commerce";
import { useCheckoutState, useCheckoutDispatch } from "../../context/checkout";
import { FormCheckbox as FormRadio, FormError } from "../Form";
import AddressFields from "./AddressFields";

function ShippingForm() {
  const { id, live } = useCheckoutState();
  const { setShippingMethod } = useCheckoutDispatch();
  const [countries, setCountries] = useState();
  const [subdivisions, setSubdivisions] = useState();
  const [shippingOptions, setShippingOptions] = useState([]);
  const methods = useFormContext();
  const { watch, setValue } = methods;
  const [watchAddress] = useDebounce(watch('shipping'), 600);
  const watchCountry = watch('shipping.country');
  const watchSubdivision = watch('shipping.region');
  const [watchShipping] = useDebounce(watch('fulfillment.shipping_method'), 600);
  const [canCalculateTax, setCanCalculateTax] = useState(false);

  useEffect(() => {
    fetchCountries(id);
  }, []);

  useEffect(() => {
    setValue("shipping.region", "");

    if (watchCountry) {
      fetchSubdivisions(id, watchCountry);
      fetchShippingOptions(id, watchCountry);
    }
  }, [watchCountry]);

  // Side effect to check if form is ready to calculate tax
  // Update address and shippgin validity flag
  useEffect(() => {
    if (!watchAddress || !watchShipping) {
      setCanCalculateTax(false);
      return;
    }

    // Because there are different required parameters for US or CA taxes in TaxJar
    // Destructure address fields from watchAddress to check if each exists
    const {
      region,
      street,
      town_city: city,
      postal_zip_code: zip,
      country,
    } = watchAddress;

    // All taxable countries require a country and shipping input
    if (!country || !watchShipping) {
      setCanCalculateTax(false);
      return;
    }

    // Define a requiredFields array to store
    // required fields for US or CA
    const requiredFields = []

    // If country is either US or CA, set
    // push 'region' to requiredFields
    if (country === 'US' || country === 'CA') {
      requiredFields.push(region);
    }

    // If country is US, push other
    // required ields to array
    if (country === 'US') {
      requiredFields.push(street, city, zip);
    }

    // Check that address fields are provided
    if (!requiredFields.every((val) => val && val !== '')) {
      setCanCalculateTax(false);
      return;
    }

    // Ready to calculate tax when all above checks pass
    console.log('Ready to calculate tax');
    setCanCalculateTax(true);
  }, [watchAddress, watchShipping]);

  useEffect(() => {
    if (watchSubdivision) {
      fetchShippingOptions(id, watchCountry, watchSubdivision);
    }
  }, [watchSubdivision]);

  // Set tax zone when address is provided/valid
  // when 'canCalculateTax' is true
  useEffect(() => {
    if (!canCalculateTax) {
      return;
    }

    const { region, country, postal_zip_code: zip } = watchAddress || {};

    if (!watchShipping) {
      return;
    }

    // Chec returns the region code prefixed with the country code.
    // Beacuse TaxJar expects a 2-letter ISO code, we need to
    // strip it from the returned merchant region
    const regionCode = region.split('-')[1];

    setTaxZone(id, {
      country,
      regionCode,
      zip,
    })
  }, [canCalculateTax]);

  const fetchCountries = async (checkoutId) => {
    try {
      const { countries } = await commerce.services.localeListShippingCountries(
        checkoutId
      );

      setCountries(countries);
    } catch (err) {
      // noop
    }
  };

  const fetchSubdivisions = async (checkoutId, countryCode) => {
    try {
      const {
        subdivisions,
      } = await commerce.services.localeListShippingSubdivisions(
        checkoutId,
        countryCode
      );

      setSubdivisions(subdivisions);
    } catch (err) {
      // noop
    }
  };

  const fetchShippingOptions = async (checkoutId, country, region) => {
    if (!checkoutId && !country) return;

    setValue("fulfillment.shipping_method", null);

    try {
      const shippingOptions = await commerce.checkout.getShippingOptions(
        checkoutId,
        {
          country,
          ...(region && { region }),
        }
      );

      setShippingOptions(shippingOptions);

      if (shippingOptions.length === 1) {
        const [shippingOption] = shippingOptions;

        setValue("fulfillment.shipping_method", shippingOption.id);
        selectShippingMethod(shippingOption.id);
      }
    } catch (err) {
      // noop
    }
  };

  const onShippingSelect = ({ target: { value } }) =>
    selectShippingMethod(value);

  const selectShippingMethod = async (optionId) => {
    try {
      await setShippingMethod(optionId, watchCountry, watchSubdivision);
    } catch (err) {
      // noop
    }
  };


  /**
   * Sets the tax zone for the provided checkout token
   *
   * @param {string} checkoutId
   * @param {string} country
   * @param {string} region
   * @param {string} zip
   * @returns {Object|null} Tax object
   */
  const setTaxZone = async (checkoutId, { country, regionCode, zip } ) => {
    if (!checkoutId) {
      return;
    }

    try {
      const tax = await fetch(
        `/api/tax?token=${checkoutId}&country=${country}&region=${regionCode}&zip=${zip}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }).then((response) => response.json())

        console.log('Tax response', tax);

    } catch (err) {
      console.log('Error:', err);
    }
  };

  return (
    <div className="md:flex md:space-x-12 lg:space-x-24">
      <div className="md:w-1/2">
        <fieldset className="mb-3 md:mb-4">
          <legend className="text-black font-medium text-lg md:text-xl py-3 block">
            Shipping address
          </legend>

          <AddressFields
            prefix="shipping"
            countries={countries}
            subdivisions={subdivisions}
          />
        </fieldset>
      </div>
      <div className="md:w-1/2">
        <fieldset className="mb-3 md:mb-4">
          <legend className="text-black font-medium text-lg md:text-xl py-3 block">
            Shipping
          </legend>
          <div>
            {watchCountry ? (
              <>
                <div className="-space-y-1">
                  {shippingOptions.map(({ id, description, price }) => (
                    <FormRadio
                      id={id}
                      type="radio"
                      name="fulfillment.shipping_method"
                      value={id}
                      label={`${description}: ${price.formatted_with_symbol}`}
                      onChange={onShippingSelect}
                      required="You must select a shipping option"
                    />
                  ))}
                </div>

                <FormError name="fulfillment.shipping_method" />
              </>
            ) : (
              <p className="text-sm text-black">
                Please enter your address to fetch shipping options
              </p>
            )}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

export default ShippingForm;
