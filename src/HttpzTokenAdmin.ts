import {
  AccountUpdate,
  assert,
  Bool,
  method,
  Provable,
  PublicKey,
  SmartContract,
  State,
  state,
  UInt64,
  Permissions,
  VerificationKey,
} from "o1js";
import {
  FungibleTokenAdminBase,
  FungibleTokenAdminDeployProps,
} from "./FungibleTokenAdmin.js";
import { CIRCULATION_MAX } from "./constants.js";

export class HttpzTokenAdmin
  extends SmartContract
  implements FungibleTokenAdminBase
{
  @state(PublicKey)
  private adminPublicKey = State<PublicKey>();

  // Total mint amount
  @state(UInt64)
  private totalMintAmount = State<UInt64>();

  async deploy(props: FungibleTokenAdminDeployProps) {
    await super.deploy(props);
    this.adminPublicKey.set(props.adminPublicKey);
    this.totalMintAmount.set(UInt64.from(0));

    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible(),
    });
  }

  /** Update the verification key.
   * Note that because we have set the permissions for setting the verification key to `impossibleDuringCurrentVersion()`, this will only be possible in case of a protocol update that requires an update.
   */
  @method
  public async updateVerificationKey(vk: VerificationKey) {
    this.account.verificationKey.set(vk);
  }

  private async ensureAdminSignature() {
    const admin = await Provable.witnessAsync(PublicKey, async () => {
      let pk = await this.adminPublicKey.fetch();
      assert(pk !== undefined, "could not fetch admin public key");
      return pk;
    });
    this.adminPublicKey.requireEquals(admin);
    return AccountUpdate.createSigned(admin);
  }

  // Validates if minting is allowed within circulation limit
  @method.returns(Bool)
  public async canMint(accountUpdate: AccountUpdate) {
    await this.ensureAdminSignature();
    const totalMintAmount = this.totalMintAmount.getAndRequireEquals();
    const newTotalMintAmount = totalMintAmount.add(
      accountUpdate.body.balanceChange.magnitude
    );

    this.totalMintAmount.set(newTotalMintAmount);
    return newTotalMintAmount.lessThanOrEqual(UInt64.from(CIRCULATION_MAX));
  }

  @method.returns(Bool)
  public async canChangeAdmin(_admin: PublicKey) {
    await this.ensureAdminSignature();
    return Bool(true);
  }

  @method.returns(Bool)
  public async canPause(): Promise<Bool> {
    await this.ensureAdminSignature();
    return Bool(true);
  }

  @method.returns(Bool)
  public async canResume(): Promise<Bool> {
    await this.ensureAdminSignature();
    return Bool(true);
  }
}
