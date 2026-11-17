"""Drive installed Safari with its WebDriver. The fixture uses fictional data."""
import json
import os
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

evidence = {}
driver = webdriver.Safari() if os.environ.get("PICKER_CHROME") != "1" else webdriver.Chrome()
try:
    evidence["browser"] = driver.capabilities.get("browserVersion")
    for scenario, stage, label in [
        ("success", "matched-at-return", "Sol"),
        ("stale", "different-at-return", "Terra"),
        ("reject", "rejected", "Terra"),
        ("focus-return", "matched-at-return", "Sol"),
        ("dismiss", "closed", "Terra"),
    ]:
        driver.get("http://127.0.0.1:8126/")
        wait = WebDriverWait(driver, 8)
        wait.until(lambda d: d.find_elements(By.CSS_SELECTOR, ".codexModelSelectTrigger"))
        driver.execute_script("window.scenario = arguments[0]", scenario)
        try:
            driver.find_element(By.CSS_SELECTOR, "[contenteditable]").click()
            driver.find_element(By.CSS_SELECTOR, ".codexModelSelectTrigger").click()
            driver.find_element(By.CSS_SELECTOR, "[role=menuitem]").click()
            wait.until(lambda d: d.execute_script(
                "return document.querySelector('[role=searchbox]')?.getBoundingClientRect().width > 0"))
            if scenario == "focus-return":
                driver.execute_script("""
                    document.querySelector('[role=searchbox]').addEventListener('blur', () => {
                      document.querySelector('[contenteditable]').focus()
                    }, {once: true})
                """)
            if scenario == "dismiss":
                # Inject dismissal after pointerdown and before the option receives click.
                driver.execute_script("""
                    document.addEventListener('pointerdown', () => {
                      document.querySelector('[contenteditable]').focus()
                    }, {once: true})
                """)
            driver.find_element(By.XPATH, "//button[@role='menuitemradio'][contains(.,'Sol')]").click()
            wait.until(lambda d: stage in d.execute_script(
                "return window.report().clientIncidents.modelPicker.map(e => e.stage)"))
            if scenario == "dismiss":
                stages = driver.execute_script("return window.report().clientIncidents.modelPicker.map(e => e.stage)")
                assert "pointer-down" in stages and "submitted" not in stages, stages
            assert driver.find_element(By.CSS_SELECTOR, ".codexModelSelectTrigger").text.strip() == label
        finally:
            evidence[scenario] = driver.execute_script("return window.report()")
finally:
    Path(".artifacts/picker-diagnostics/report.json").write_text(json.dumps(evidence, indent=2))
    driver.quit()
