"""Exercise both pickers in a disposable official DSH Web profile using Safari."""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.support.ui import WebDriverWait

source = sys.argv[1] if len(sys.argv) > 1 else "dsh-codex-subscription@3.2.19"
build = "candidate" if len(sys.argv) > 1 else "published"
home = Path(os.environ["RUNNER_TEMP"]) / ("picker-dsh-" + build)
profiles = home / "profiles"
(profiles / "web").mkdir(parents=True)
(profiles / "package.json").write_text('{"name":"picker-host","private":true}')
env = {**os.environ, "DSH_HOME": str(home)}
subprocess.run(["npm", "install", "--no-audit", "--no-fund", "--ignore-scripts", "@deepseek-ai/dsh@0.2.2-rc.1"], cwd=profiles, env=env, check=True)
cli = profiles / "node_modules/@deepseek-ai/dsh/lib/bin.js"
subprocess.run(["node", cli, "plugin", "--profile", "web", "add", source], env=env, check=True)
account = "picker-test"
env.update(OPENAI_CODEX_SUBSCRIPTION_OAUTH=json.dumps(dict(type="oauth", access="fixture", refresh="fixture", expires=1900000000000, accountId=account)), DEEPSEEK_API_KEY="fixture", NO_PROXY="127.0.0.1,localhost")
catalog = home / "state/codex-subscription/model-catalog"
catalog.mkdir(parents=True, exist_ok=True)
key = hashlib.sha256(account.encode()).hexdigest()
names = ["Terra", "Sol", "Luna", "Astra", "Flare"]
models = [dict(slug="gpt-" + n.lower(), display_name="GPT " + n, visibility="list", supported_in_api=True, context_window=128000,
               default_reasoning_level="high", supported_reasoning_levels=[dict(effort="high", description="High")]) for n in names]
(catalog / (key + ".json")).write_text(json.dumps(dict(schemaVersion=1, accountKey=key, savedAt=int(time.time()*1000), rawCatalog=dict(models=models))))
evidence = {"dshVersion": json.loads((cli.parent.parent / "package.json").read_text())["version"],
            "plugin": json.loads((profiles / "web/node_modules/dsh-codex-subscription/package.json").read_text())["version"]}
assert evidence["dshVersion"] == "0.2.2-rc.1"
if build == "published": assert evidence["plugin"] == "3.2.19"
out = Path(".artifacts/picker-diagnostics") / (build + ".json")
log_path = home / "web.log"
with log_path.open("w") as log, subprocess.Popen(["node", cli, "web", "--no-open", "--port", "18791"], env=env, stdout=log, stderr=subprocess.STDOUT) as server:
    driver = None
    try:
        for _ in range(150):
            url = re.search(r"http://(?:127\.0\.0\.1|localhost):18791/\S*", log_path.read_text())
            if url: break
            if server.poll() is not None: raise RuntimeError("Host exited")
            time.sleep(1)
        assert url, "Missing DSH start URL"
        driver = webdriver.Safari()
        driver.get(url[0])
        wait = WebDriverWait(driver, 30, ignored_exceptions=(StaleElementReferenceException,))
        evidence["safari"] = driver.capabilities["browserVersion"]
        def rpc(endpoint, payload):
            result = driver.execute_async_script("""
              const [name, payload, done] = arguments, method = 'codex-subscription/' + name;
              fetch('/api/' + method, {method:'POST',headers:{'content-type':'application/json'},
                body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload})})
                .then(r=>r.json()).then(r=>done(r.result),()=>done({ok:false}))
            """, endpoint, payload)
            assert result and result["ok"], endpoint
            return result["value"]
        def trigger(custom):
            return driver.find_elements(By.CSS_SELECTOR, ".codexModelSelectTrigger" if custom else "button[aria-haspopup=menu][aria-busy][class*=trigger]")
        for mode in ["legacy", "dsh"]:
            rpc("preferences/update", {"composerModelPicker":mode})
            assert rpc("preferences/status", {})["composerModelPicker"] == mode
            driver.refresh()
            custom = mode == "legacy"
            def ready(d):
                dismissed = d.execute_script("""
                  const notice = [...document.querySelectorAll('button')].find(
                    b => b.innerText.trim() === 'Continue' && document.body.innerText.includes('Preview Notice'));
                  if (!notice) return false;
                  notice.click();
                  return true;
                """)
                if dismissed: return False
                buttons = trigger(custom)
                if buttons: return buttons[0]
                d.execute_script("""
                  [...document.querySelectorAll('button')].find(
                    b => ['New chat','New session','新会话','新建会话','新对话'].includes(b.innerText.trim())
                  )?.click()
                """)
                return False
            button = wait.until(ready)
            record = evidence[mode] = []
            for _ in range(2):
                button = wait.until(lambda d: trigger(custom)[0])
                before = button.text
                button.click()
                wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "button[role=menuitem]")).click()
                options = wait.until(lambda d: d.find_elements(By.CSS_SELECTOR, "button[role=menuitemradio]"))
                searching = bool(driver.find_elements(By.CSS_SELECTOR, "[role=searchbox], input[type=search]"))
                record.append(dict(before=before, optionCount=len(options), search=searching,
                                   choices=[b.text.strip().splitlines()[0] for b in options]))
                target = next(b for b in options if b.get_dom_attribute("aria-checked") == "false" and "GPT" in b.text)
                label = target.text.strip().splitlines()[0]
                record[-1]["target"] = label
                # Wait for the popover to settle so WebDriver clicks the visible option.
                driver.execute_async_script("""
                    const [b,done] = arguments; let previous='', stable=0;
                    function frame() {
                      const rect = JSON.stringify(b.getBoundingClientRect());
                      stable = previous === rect ? stable+1 : 0; previous=rect;
                      if(stable>=4) done(); else requestAnimationFrame(frame)
                    }
                    frame()
                """, target)
                driver.execute_script("""
                    window.pickerEvents = []
                    const describe = node => node?.closest?.('[role=menuitemradio]') ? 'option'
                        : node?.matches?.('[contenteditable=true]') ? 'editor'
                        : node?.getAttribute?.('role') || node?.tagName || 'window'
                    const observe = event => window.pickerEvents.push([event.type,describe(event.target),describe(document.activeElement)])
                    window.stopPickerTrace = () => types.forEach(t=>window.removeEventListener(t,observe,true))
                    const types=['pointerdown','mousedown','focusin','blur','pointerup','click','resize']
                    types.forEach(t=>window.addEventListener(t,observe,true))
                """)
                target.click()
                try:
                    WebDriverWait(driver, 5).until(lambda d: label in trigger(custom)[0].text)
                except TimeoutException:
                    pass
                record[-1]["after"] = trigger(custom)[0].text
                record[-1]["events"] = driver.execute_script("window.stopPickerTrace(); return window.pickerEvents.slice(-25)")
                if label not in record[-1]["after"]: break
        for mode in ["legacy", "dsh"]:
            assert evidence[mode]
            if build == "candidate":
                assert len(evidence[mode]) == 2 and all(row["target"] in row["after"] for row in evidence[mode]), mode
    finally:
        server.terminate()
        if driver:
            evidence["surface"] = driver.execute_script("return document.body.innerText.slice(0,2500)").replace(env["OPENAI_CODEX_SUBSCRIPTION_OAUTH"], "[fixture]")
            driver.quit()
        out.write_text(json.dumps(evidence, indent=2, ensure_ascii=False))
